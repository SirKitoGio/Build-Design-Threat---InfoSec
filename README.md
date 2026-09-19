# AWSSBGJRU QR Attendance

ITC 303 Midterm Activity 1 — Club event check-in with QR codes.

**Stack:** FastAPI + SQLite + React (Vite)  
**Phase 5 (current):** bcrypt passwords, random sessions, unguessable QR tokens, one check-in per person, no force bypass.

## Features

1. Organizer registers/logs in and creates an event  
2. System shows a **QR code** encoding the check-in URL  
3. Attendee registers/logs in and checks in via QR / link  
4. Organizer views attendance list  
5. Organizer can **close** check-in (optional end time on create)

## Intentional Phase 3 weaknesses

| # | Flaw | Why it exists |
|---|------|----------------|
| 1 | Passwords stored in **plain text** | Information Disclosure / easy credential theft |
| 2 | Guessable check-in URLs `/checkin/{id}` | Spoofing / unauthorized check-in discovery |
| 3 | Closed/ended events bypassable with `?force=1` | Tampering / broken access control |
| 4 | Duplicate check-ins allowed; no rate limit | Tampering / DoS / integrity issues |

Weak session tokens look like `userId:role:username` (forgeable — Spoofing / Elevation).

## Quick start

### 1. Backend (terminal A)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### 2. Frontend (terminal B)

```bash
cd frontend
npm install
npm run dev
```

App: http://127.0.0.1:5173

### 3. Demo script (2–3 minutes)

1. Register **organizer** → create event “Club Night” → show QR on screen.  
2. In a private window, register **attendee** → open QR link `/checkin/1` → Check in.  
3. Back as organizer → Refresh attendance.  
4. Close check-in → as attendee try again (blocked) → use **Force check-in** (shows flaw #3).  
5. Check in again (duplicate allowed — flaw #4).  
6. Optional Phase 5: stop API, delete `backend/awssbgjru.db`, restart with hashing:

```bash
cd backend
rm -f awssbgjru.db
USE_PASSWORD_HASHING=1 uvicorn main:app --reload --port 8000
```

Re-register users; login response shows `password_storage: bcrypt+salt`.

## Project layout

```
backend/main.py          # API + intentional flaws + hashing toggle
backend/models.py        # User, Event, CheckIn
backend/database.py      # SQLite
frontend/src/pages/      # Auth, Organizer, Attendee, Check-in
```

## Out of scope

Email/SMS invites, native camera app, payments, multi-club orgs, production HTTPS/deploy.

## Report (hard copy)

Full draft ready to paste into Word:

- [`report/REPORT.md`](report/REPORT.md) — Cover, Phases 1–5, STRIDE table, conclusion, references  
- [`report/diagrams/01-architecture.html`](report/diagrams/01-architecture.html) — Architecture + trust boundaries  
- [`report/diagrams/02-dfd-level1.html`](report/diagrams/02-dfd-level1.html) — DFD Level 1  
- [`report/diagrams/03-secure-redesign.html`](report/diagrams/03-secure-redesign.html) — Phase 5 redesign  

**Word settings:** Arial 12, Justify, Double spacing · Print diagrams from browser · Navy blue folder with clip.
# Build-Design-Threat---InfoSec
# Build-Design-Threat---InfoSec
