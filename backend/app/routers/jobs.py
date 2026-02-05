from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud
from app.deps import get_current_user
from app.db import get_db
from app import models
from app.schemas import JobCreate, JobOut, JobUpdate


router = APIRouter(prefix='/jobs', tags=['jobs'])


@router.get('', response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  return crud.list_jobs(db)


@router.post('', response_model=JobOut)
def create_job(data: JobCreate, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  return crud.create_job(db, data)


@router.get('/{job_id}', response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  job = crud.get_job(db, job_id)
  if not job:
    raise HTTPException(status_code=404, detail='Job not found')
  return job


@router.put('/{job_id}', response_model=JobOut)
def update_job(job_id: int, data: JobUpdate, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  job = crud.get_job(db, job_id)
  if not job:
    raise HTTPException(status_code=404, detail='Job not found')
  return crud.update_job(db, job, data)


@router.delete('/{job_id}')
def delete_job(job_id: int, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  job = crud.get_job(db, job_id)
  if not job:
    raise HTTPException(status_code=404, detail='Job not found')
  crud.delete_job(db, job)
  return {'ok': True}
