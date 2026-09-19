"""
AWSSBGJRU QR Attendance — Phase 5 (fixed) FastAPI backend

Controls:
- bcrypt password hashing
- random session tokens (role loaded from the database)
- unguessable check-in tokens in QR URLs
- closed/ended events enforced with no client bypass
- one check-in per attendee per event
- basic rate limiting and audit log
"""

from __future__ import annotations

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

from database import Base, engine, get_db
from models import AuditLog, CheckIn, Event, SessionToken, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AWSSBGJRU QR Attendance", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RATE_WINDOW = timedelta(minutes=1)
RATE_LIMIT = 40
_hits: Dict[str, Deque[datetime]] = defaultdict(deque)


def rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    now = datetime.utcnow()
    q = _hits[ip]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests. Wait a moment.")
    q.append(now)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    role: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    password_storage: str
    mode: str


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


def issue_token(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(SessionToken(token=token, user_id=user.id))
    db.commit()
    return token


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
    if not row:
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


@app.post("/api/register", response_model=AuthResponse)
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
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="That username is already taken.")

    user = User(username=username, password=store_password(body.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = issue_token(db, user)
    write_audit(db, user.id, "register", role)
    return AuthResponse(
        token=token,
        user=UserOut.model_validate(user),
        password_storage="bcrypt+salt",
        mode="secure",
    )


@app.post("/api/login", response_model=AuthResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(request)
    user = db.query(User).filter(User.username == body.username.strip()).first()
    if not user or not verify_password(body.password, user.password):
        raise HTTPException(status_code=401, detail="Username or password is not correct.")
    token = issue_token(db, user)
    write_audit(db, user.id, "login")
    return AuthResponse(
        token=token,
        user=UserOut.model_validate(user),
        password_storage="bcrypt+salt",
        mode="secure",
    )


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
