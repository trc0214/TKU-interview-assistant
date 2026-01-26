from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


engine = create_engine(
  settings.resolved_database_url,
  connect_args={"check_same_thread": False} if settings.resolved_database_url.startswith('sqlite') else {},
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def get_db():
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()
