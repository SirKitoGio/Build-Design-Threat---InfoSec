import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

if os.environ.get("VERCEL"):
    DATABASE_URL = "sqlite:////tmp/awssbgjru.db"
else:
    DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./awssbgjru.db")

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _add_column(table: str, column: str, ddl: str) -> None:
    insp = inspect(engine)
    if table not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns(table)}
    if column in cols:
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def migrate():
    _add_column("users", "email", "email VARCHAR(255)")
    _add_column("users", "failed_logins", "failed_logins INTEGER NOT NULL DEFAULT 0")
    _add_column("users", "locked_until", "locked_until DATETIME")
    _add_column("auth_codes", "attempts", "attempts INTEGER NOT NULL DEFAULT 0")
    insp = inspect(engine)
    if "sessions" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("sessions")}
    if "expires_at" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE sessions ADD COLUMN expires_at DATETIME"))
        conn.execute(
            text(
                "UPDATE sessions SET expires_at = datetime('now', '+12 hours') "
                "WHERE expires_at IS NULL"
            )
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
