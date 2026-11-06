"""
AWSSBGJRU QR Attendance — FastAPI backend

Controls:
- bcrypt password hashing and password complexity
- email MFA codes with attempt limits
- login lockout after repeated failures
- expiring session tokens and server-side logout
- unguessable check-in tokens in QR URLs
- closed/ended events enforced with no client bypass
- one check-in per attendee per event
- rate limiting and audit log
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Deque, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import Base, engine, get_db, migrate
from mailer import mail_configured, send_code_email
from models import AuditLog, AuthCode, CheckIn, Event, SessionToken, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Base.metadata.create_all(bind=engine)
migrate()

app = FastAPI(title="AWSSBGJRU QR Attendance", version="2.0.0")

_cors = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    *[
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ],
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


RATE_WINDOW = timedelta(minutes=1)
RATE_LIMIT = 40
AUTH_RATE_LIMIT = 10
LOCKOUT_AFTER = 5
LOCKOUT_MINUTES = 15
CODE_MAX_ATTEMPTS = 5
SESSION_HOURS = 12
FORGOT_MESSAGE = "If that email is on an account, a code was sent."
_hits: Dict[str, Deque[datetime]] = defaultdict(deque)


def rate_limit(request: Request, limit: int = RATE_LIMIT, bucket: str = "general") -> None:
    ip = request.client.host if request.client else "unknown"
    now = datetime.utcnow()
    q = _hits[f"{bucket}:{ip}"]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests. Wait a moment.")
    q.append(now)


def auth_rate_limit(request: Request) -> None:
    rate_limit(request, AUTH_RATE_LIMIT, "auth")


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    role: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class MfaVerifyRequest(BaseModel):
    mfa_token: str = Field(min_length=8, max_length=80)
    code: str = Field(min_length=6, max_length=6)


class MfaResendRequest(BaseModel):
    mfa_token: str = Field(min_length=8, max_length=80)


class ForgotRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class ResetRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    password_storage: str
    mode: str


class LoginResponse(BaseModel):
    mfa_required: bool = False
    mfa_token: Optional[str] = None
    demo_code: Optional[str] = None
    token: Optional[str] = None
    user: Optional[UserOut] = None
    password_storage: str = "bcrypt+salt"
    mode: str = "secure"


class ForgotResponse(BaseModel):
    message: str
    demo_code: Optional[str] = None


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    ends_at: Optional[datetime] = None


class EventOut(BaseModel):
    id: int
    title: str
    description: str
    organizer_id: int
    ends_at: Optional[datetime]
    is_closed: bool
    created_at: datetime
    checkin_token: str
    checkin_path: str

    class Config:
        from_attributes = True


class CheckInOut(BaseModel):
    id: int
    event_id: int
    attendee_id: int
    attendee_username: str
    checked_in_at: datetime
    event_title: Optional[str] = None


def store_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, stored: str) -> bool:
    return pwd_context.verify(raw, stored)


def password_problems(raw: str, username: str = "", email: str = "") -> str:
    missing: List[str] = []
    if not 8 <= len(raw) <= 128:
        missing.append("8 to 128 characters")
    if not re.search(r"[A-Z]", raw):
        missing.append("an uppercase letter")
    if not re.search(r"[a-z]", raw):
        missing.append("a lowercase letter")
    if not re.search(r"\d", raw):
        missing.append("a digit")
    if not re.search(r"[^A-Za-z0-9]", raw):
        missing.append("a symbol")
    parts: List[str] = []
    if missing:
        parts.append("Use a password with " + ", ".join(missing) + ".")
    lowered = raw.strip().lower()
    if username and lowered == username.strip().lower():
        parts.append("It must not match your username.")
    if email and lowered == email.strip().lower():
        parts.append("It must not match your email.")
    return " ".join(parts)


def require_password(raw: str, username: str = "", email: str = "") -> None:
    detail = password_problems(raw, username, email)
    if detail:
        raise HTTPException(status_code=400, detail=detail)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return email


def code_pepper() -> bytes:
    return os.getenv("CODE_PEPPER", "awssbgjru-dev-pepper").encode()


def hash_code(code: str) -> str:
    return hmac.new(code_pepper(), code.encode(), hashlib.sha256).hexdigest()


def deliver_code(email: str, code: str, purpose: str) -> bool:
    if not mail_configured():
        send_code_email(email, code, purpose)
        return not bool(os.environ.get("VERCEL"))
    return send_code_email(email, code, purpose)


def issue_auth_code(db: Session, user: User, purpose: str) -> tuple[str, str]:
    db.query(AuthCode).filter(
        AuthCode.user_id == user.id,
        AuthCode.purpose == purpose,
        AuthCode.used.is_(False),
    ).delete()
    code = f"{secrets.randbelow(1_000_000):06d}"
    token = secrets.token_urlsafe(24)
    db.add(
        AuthCode(
            token=token,
            user_id=user.id,
            purpose=purpose,
            code_hash=hash_code(code),
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            used=False,
            attempts=0,
        )
    )
    db.commit()
    return token, code


def consume_auth_code(db: Session, purpose: str, code: str, token: Optional[str] = None, user: Optional[User] = None) -> User:
    query = db.query(AuthCode).filter(
        AuthCode.purpose == purpose,
        AuthCode.used.is_(False),
    )
    if token:
        query = query.filter(AuthCode.token == token)
    if user:
        query = query.filter(AuthCode.user_id == user.id)
    row = query.order_by(AuthCode.id.desc()).first()
    if not row:
        raise HTTPException(status_code=400, detail="That code is not valid.")
    owner = user or db.get(User, row.user_id)
    if not owner or row.user_id != owner.id:
        raise HTTPException(status_code=400, detail="That code is not valid.")
    if datetime.utcnow() > row.expires_at:
        raise HTTPException(status_code=400, detail="That code has expired. Request a new one.")
    if not hmac.compare_digest(row.code_hash, hash_code(code.strip())):
        row.attempts = (row.attempts or 0) + 1
        burned = row.attempts >= CODE_MAX_ATTEMPTS
        if burned:
            row.used = True
        db.commit()
        if burned:
            raise HTTPException(
                status_code=400,
                detail="Too many wrong codes. Request a new one.",
            )
        raise HTTPException(status_code=400, detail="That code is not valid.")
    row.used = True
    db.commit()
    return owner


def maybe_demo_code(code: str) -> Optional[str]:
    if mail_configured() or os.environ.get("VERCEL"):
        return None
    return code


def finish_login(db: Session, user: User) -> AuthResponse:
    token = issue_token(db, user)
    write_audit(db, user.id, "login")
    return AuthResponse(
        token=token,
        user=UserOut.model_validate(user),
        password_storage="bcrypt+salt",
        mode="secure",
    )


def issue_token(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        SessionToken(
            token=token,
            user_id=user.id,
            expires_at=datetime.utcnow() + timedelta(hours=SESSION_HOURS),
        )
    )
    db.commit()
    return token


def clear_expired_lock(user: User) -> None:
    if user.locked_until and datetime.utcnow() >= user.locked_until:
        user.locked_until = None
        user.failed_logins = 0


def note_failed_login(db: Session, user: User) -> None:
    user.failed_logins = (user.failed_logins or 0) + 1
    if user.failed_logins >= LOCKOUT_AFTER:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        write_audit(db, user.id, "login_locked")
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-ins. This account is locked for 15 minutes.",
        )
    write_audit(db, user.id, "login_failed")
    raise HTTPException(status_code=401, detail="Username or password is not correct.")


def write_audit(db: Session, user_id: Optional[int], action: str, detail: str = "") -> None:
    db.add(AuditLog(user_id=user_id, action=action, detail=detail[:500]))
    db.commit()


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please log in.")
    token = authorization.removeprefix("Bearer ").strip()
    row = db.query(SessionToken).filter(SessionToken.token == token).first()
    if not row or row.expires_at is None or datetime.utcnow() > row.expires_at:
        raise HTTPException(status_code=401, detail="Session expired. Log in again.")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


def event_to_out(event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        title=event.title,
        description=event.description or "",
        organizer_id=event.organizer_id,
        ends_at=event.ends_at,
        is_closed=event.is_closed,
        created_at=event.created_at,
        checkin_token=event.checkin_token,
        checkin_path=f"/checkin/{event.checkin_token}",
    )


def checkin_to_out(row: CheckIn, title: Optional[str] = None) -> CheckInOut:
    return CheckInOut(
        id=row.id,
        event_id=row.event_id,
        attendee_id=row.attendee_id,
        attendee_username=row.attendee.username,
        checked_in_at=row.checked_in_at,
        event_title=title or (row.event.title if row.event else None),
    )


@app.get("/")
def root():
    return {
        "app": "AWSSBGJRU QR Attendance",
        "mode": "secure",
        "password_storage": "bcrypt+salt",
    }


@app.post("/api/register", response_model=LoginResponse)
def register(
    body: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    rate_limit(request)
    role = body.role.lower().strip()
    if role not in {"organizer", "attendee"}:
        raise HTTPException(status_code=400, detail="Role must be organizer or attendee.")
    username = body.username.strip()
    email = normalize_email(body.email)
    require_password(body.password, username, email)
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="That username is already taken.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="That email is already registered.")

    user = User(
        username=username,
        email=email,
        password=store_password(body.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    write_audit(db, user.id, "register", role)
    mfa_token, code = issue_auth_code(db, user, "login")
    if not deliver_code(user.email, code, "login"):
        raise HTTPException(
            status_code=502,
            detail="Could not send the email code. Check the address and try logging in.",
        )
    write_audit(db, user.id, "login_mfa_sent")
    return LoginResponse(
        mfa_required=True,
        mfa_token=mfa_token,
        demo_code=maybe_demo_code(code),
    )


@app.post("/api/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    auth_rate_limit(request)
    ident = body.username.strip()
    user = db.query(User).filter(User.username == ident).first()
    if not user and "@" in ident:
        user = db.query(User).filter(User.email == ident.lower()).first()
    if user:
        clear_expired_lock(user)
        if user.locked_until and datetime.utcnow() < user.locked_until:
            write_audit(db, user.id, "login_locked")
            raise HTTPException(
                status_code=429,
                detail="This account is locked. Try again in 15 minutes.",
            )
    if not user or not verify_password(body.password, user.password):
        if user:
            note_failed_login(db, user)
        raise HTTPException(status_code=401, detail="Username or password is not correct.")
    user.failed_logins = 0
    user.locked_until = None
    if not user.email:
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="This account has no email, so a sign-in code cannot be sent.",
        )
    mfa_token, code = issue_auth_code(db, user, "login")
    if not deliver_code(user.email, code, "login"):
        raise HTTPException(
            status_code=502,
            detail="Could not send the email code. Check the address and try again.",
        )
    write_audit(db, user.id, "login_mfa_sent")
    return LoginResponse(
        mfa_required=True,
        mfa_token=mfa_token,
        demo_code=maybe_demo_code(code),
    )


@app.post("/api/login/mfa", response_model=AuthResponse)
def login_mfa(body: MfaVerifyRequest, request: Request, db: Session = Depends(get_db)):
    auth_rate_limit(request)
    user = consume_auth_code(db, "login", body.code, token=body.mfa_token)
    return finish_login(db, user)


@app.post("/api/login/mfa/resend", response_model=LoginResponse)
def resend_mfa(body: MfaResendRequest, request: Request, db: Session = Depends(get_db)):
    auth_rate_limit(request)
    row = (
        db.query(AuthCode)
        .filter(
            AuthCode.token == body.mfa_token,
            AuthCode.purpose == "login",
            AuthCode.used.is_(False),
        )
        .first()
    )
    if not row or datetime.utcnow() > row.expires_at:
        raise HTTPException(
            status_code=400,
            detail="That sign-in session expired. Start again.",
        )
    user = db.get(User, row.user_id)
    if not user or not user.email:
        raise HTTPException(status_code=400, detail="Could not send a new code.")
    mfa_token, code = issue_auth_code(db, user, "login")
    if not deliver_code(user.email, code, "login"):
        raise HTTPException(
            status_code=502,
            detail="Could not send the email code. Try again.",
        )
    write_audit(db, user.id, "login_mfa_sent", "resend")
    return LoginResponse(
        mfa_required=True,
        mfa_token=mfa_token,
        demo_code=maybe_demo_code(code),
    )


@app.post("/api/forgot", response_model=ForgotResponse)
def forgot_password(body: ForgotRequest, request: Request, db: Session = Depends(get_db)):
    auth_rate_limit(request)
    email = normalize_email(body.email)
    user = db.query(User).filter(User.email == email).first()
    demo = None
    if user:
        _, code = issue_auth_code(db, user, "reset")
        sent = deliver_code(email, code, "reset")
        write_audit(
            db,
            user.id,
            "password_reset_sent" if sent else "password_reset_send_failed",
        )
        if sent:
            demo = maybe_demo_code(code)
    return ForgotResponse(message=FORGOT_MESSAGE, demo_code=demo)


@app.post("/api/reset", response_model=AuthResponse)
def reset_password(body: ResetRequest, request: Request, db: Session = Depends(get_db)):
    auth_rate_limit(request)
    email = normalize_email(body.email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="That code is not valid.")
    require_password(body.password, user.username, user.email or "")
    consume_auth_code(db, "reset", body.code, user=user)
    user.password = store_password(body.password)
    user.failed_logins = 0
    user.locked_until = None
    db.query(SessionToken).filter(SessionToken.user_id == user.id).delete()
    db.commit()
    write_audit(db, user.id, "password_reset")
    return finish_login(db, user)


@app.post("/api/logout")
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        db.query(SessionToken).filter(SessionToken.token == token).delete()
        db.commit()
    return {"ok": True}


@app.get("/api/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@app.post("/api/events", response_model=EventOut)
def create_event(
    body: EventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "organizer":
        raise HTTPException(status_code=403, detail="Organizers only.")
    event = Event(
        title=body.title.strip(),
        description=(body.description or "").strip(),
        organizer_id=user.id,
        checkin_token=secrets.token_urlsafe(18),
        ends_at=body.ends_at,
        is_closed=False,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    write_audit(db, user.id, "create_event", event.title)
    return event_to_out(event)


@app.get("/api/events", response_model=List[EventOut])
def list_events(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "organizer":
        raise HTTPException(status_code=403, detail="Organizers only.")
    events = (
        db.query(Event)
        .filter(Event.organizer_id == user.id)
        .order_by(Event.created_at.desc())
        .all()
    )
    return [event_to_out(e) for e in events]


@app.get("/api/events/{event_id}", response_model=EventOut)
def get_event(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if user.role != "organizer" or event.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Not your event.")
    return event_to_out(event)


@app.post("/api/events/{event_id}/close", response_model=EventOut)
def close_event(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "organizer":
        raise HTTPException(status_code=403, detail="Organizers only.")
    event = db.get(Event, event_id)
    if not event or event.organizer_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found.")
    event.is_closed = True
    db.commit()
    db.refresh(event)
    write_audit(db, user.id, "close_event", str(event.id))
    return event_to_out(event)


@app.get("/api/events/{event_id}/attendance", response_model=List[CheckInOut])
def attendance(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if user.role != "organizer" or event.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Organizers only.")
    rows = (
        db.query(CheckIn)
        .filter(CheckIn.event_id == event_id)
        .order_by(CheckIn.checked_in_at.asc())
        .all()
    )
    return [checkin_to_out(r, event.title) for r in rows]


@app.get("/api/me/checkins", response_model=List[CheckInOut])
def my_checkins(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "attendee":
        raise HTTPException(status_code=403, detail="Attendees only.")
    rows = (
        db.query(CheckIn)
        .filter(CheckIn.attendee_id == user.id)
        .order_by(CheckIn.checked_in_at.desc())
        .all()
    )
    return [checkin_to_out(r) for r in rows]


@app.get("/api/checkin/{token}", response_model=EventOut)
def preview_checkin(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(Event).filter(Event.checkin_token == token).first()
    if not event:
        raise HTTPException(status_code=404, detail="This check-in link is not valid.")
    if user.role == "organizer" and event.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Switch to an attendee account to check in.")
    return event_to_out(event)


@app.post("/api/checkin/{token}", response_model=CheckInOut)
def check_in(
    token: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rate_limit(request)
    if user.role != "attendee":
        raise HTTPException(status_code=403, detail="Switch to an attendee account to check in.")

    event = db.query(Event).filter(Event.checkin_token == token).first()
    if not event:
        raise HTTPException(status_code=404, detail="This check-in link is not valid.")

    ended = bool(event.ends_at and datetime.utcnow() > event.ends_at)
    if event.is_closed or ended:
        raise HTTPException(status_code=400, detail="This event is closed.")

    existing = (
        db.query(CheckIn)
        .filter(CheckIn.event_id == event.id, CheckIn.attendee_id == user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="You already checked in to this event.")

    row = CheckIn(event_id=event.id, attendee_id=user.id)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="You already checked in to this event.")
    db.refresh(row)
    write_audit(db, user.id, "check_in", str(event.id))
    return checkin_to_out(row, event.title)
