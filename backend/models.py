from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))

    events: Mapped[list[Event]] = relationship(back_populates="organizer")
    checkins: Mapped[list[CheckIn]] = relationship(back_populates="attendee")
    sessions: Mapped[list[SessionToken]] = relationship(back_populates="user")


class SessionToken(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="sessions")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    checkin_token: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    organizer: Mapped[User] = relationship(back_populates="events")
    checkins: Mapped[list[CheckIn]] = relationship(back_populates="event")


class CheckIn(Base):
    __tablename__ = "checkins"
    __table_args__ = (
        UniqueConstraint("event_id", "attendee_id", name="uq_event_attendee"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    attendee_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    checked_in_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    event: Mapped[Event] = relationship(back_populates="checkins")
    attendee: Mapped[User] = relationship(back_populates="checkins")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
