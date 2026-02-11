from __future__ import annotations
import anyio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db import SessionLocal, engine
from app.models import Base
from app.routers.ai_analyses import router as ai_router
from app.routers.auth import router as auth_router
from app.routers.interviews import router as interviews_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router
from app.seed import seed_if_empty


def create_app() -> FastAPI:
  app = FastAPI(title='AI Interview Assistant API', version='0.1.0')

  app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
  )

  app.include_router(jobs_router, prefix='/api/v1')
  app.include_router(resumes_router, prefix='/api/v1')
  app.include_router(ai_router, prefix='/api/v1')
  app.include_router(interviews_router, prefix='/api/v1')
  app.include_router(auth_router, prefix='/api/v1')

  @app.get('/health')
  def health():
    return {'ok': True}

  @app.on_event('startup')
  def on_startup():
    try:
      print("Creating database tables...")
      Base.metadata.create_all(bind=engine)
      print("Database tables created successfully")
    except Exception as e:
      print(f"Error creating tables: {e}")
    # NOTE: seed_if_empty 已禁用，可手動執行: python -m app.seed

  return app


app = create_app()
