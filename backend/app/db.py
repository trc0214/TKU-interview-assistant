from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


database_url = settings.resolved_database_url

engine = create_engine(
  database_url,
  echo=settings.sqlalchemy_echo,
  connect_args={
    'check_same_thread': False,
    'timeout': 30,
  } if 'sqlite' in database_url else {},
  pool_pre_ping=True if 'postgresql' in database_url else False,
  pool_size=5 if 'postgresql' in database_url else 0,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def get_db():
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()