from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db import SessionLocal, engine
from app.models import Base
from app.routers.ai_analyses import router as ai_router
from app.routers.interviews import router as interviews_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router
from app.seed import seed_if_empty


def create_app() -> FastAPI:
  app = FastAPI(title='AI Interview Assistant API', version='0.1.0')

  app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$',
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
  )

  app.include_router(jobs_router, prefix='/api/v1')
  app.include_router(resumes_router, prefix='/api/v1')
  app.include_router(ai_router, prefix='/api/v1')
  app.include_router(interviews_router, prefix='/api/v1')

  @app.get('/health')
  def health():
    return {'ok': True}

  @app.on_event('startup')
  def on_startup():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
      seed_if_empty(db)

  return app


app = create_app()
