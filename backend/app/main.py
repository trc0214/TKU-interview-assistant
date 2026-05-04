from __future__ import annotations
import anyio
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db import SessionLocal, engine
from app.models import Base
from app.routers.ai_analyses import router as ai_router
from app.routers.auth import router as auth_router
from app.routers.interviews import router as interviews_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router
from app.routers.speech import router as speech_router
from app.seed import seed_if_empty


def _ensure_sqlite_compatibility() -> None:
  if not str(engine.url).startswith('sqlite'):
    return

  with engine.begin() as connection:
    table_columns = connection.execute(text("PRAGMA table_info('interviews')")).fetchall()
    column_names = {str(row[1]) for row in table_columns}

    if 'meeting_hash' not in column_names:
      connection.execute(text("ALTER TABLE interviews ADD COLUMN meeting_hash TEXT"))

      rows = connection.execute(text("SELECT id FROM interviews WHERE meeting_hash IS NULL OR meeting_hash = ''")).fetchall()
      for row in rows:
        connection.execute(
          text("UPDATE interviews SET meeting_hash = :meeting_hash WHERE id = :id"),
          {
            'meeting_hash': str(uuid.uuid4()),
            'id': int(row[0]),
          },
        )

      try:
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_interviews_meeting_hash ON interviews (meeting_hash)"))
      except Exception:
        pass

    rows_without_hash = connection.execute(
      text("SELECT id FROM interviews WHERE meeting_hash IS NULL OR meeting_hash = ''")
    ).fetchall()
    for row in rows_without_hash:
      connection.execute(
        text("UPDATE interviews SET meeting_hash = :meeting_hash WHERE id = :id"),
        {
          'meeting_hash': str(uuid.uuid4()),
          'id': int(row[0]),
        },
      )


def create_app() -> FastAPI:
  app = FastAPI(title='AI Interview Assistant API', version='0.1.0')

  cors_origins = settings.cors_origins_list or ['http://localhost:5173', 'http://localhost:5174']

  app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r'https?://(localhost|127\.0\.0\.1)(:\d+)?',
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
  )

  app.include_router(jobs_router, prefix='/api/v1')
  app.include_router(resumes_router, prefix='/api/v1')
  app.include_router(ai_router, prefix='/api/v1')
  app.include_router(interviews_router, prefix='/api/v1')
  app.include_router(auth_router, prefix='/api/v1')
  app.include_router(speech_router, prefix='/api/v1')

  @app.get('/health')
  def health():
    return {'ok': True}

  @app.on_event('startup')
  def on_startup():
    try:
      print("Creating database tables...")
      Base.metadata.create_all(bind=engine)
      _ensure_sqlite_compatibility()
      print("Database tables created successfully")
    except Exception as e:
      print(f"Error creating tables: {e}")
    # NOTE: seed_if_empty 已禁用，可手動執行: python -m app.seed

  return app


app = create_app()
