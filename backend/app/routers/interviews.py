from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud, models
from app.deps import get_current_user
from app.db import get_db
from app.schemas import InterviewCreate, InterviewOut, InterviewUpdate


router = APIRouter(prefix='/interviews', tags=['interviews'])


def _to_out(interview, job=None, resume=None) -> InterviewOut:
  return InterviewOut(
    **interview.__dict__,
    job_title=(job.title if job else None),
    department=(job.department if job else None),
    candidate_name=(resume.candidate_name if resume else None),
  )


@router.get('', response_model=list[InterviewOut])
def list_interviews(
  job_id: int | None = Query(default=None),
  resume_id: int | None = Query(default=None),
  status: str | None = Query(default=None),
  db: Session = Depends(get_db),
  _current_user: models.User = Depends(get_current_user),
):
  items = crud.list_interviews(db, job_id=job_id, resume_id=resume_id, status=status)
  out: list[InterviewOut] = []
  for it in items:
    job = crud.get_job(db, it.job_id)
    resume = crud.get_resume(db, it.resume_id)
    out.append(_to_out(it, job=job, resume=resume))
  return out


@router.post('', response_model=InterviewOut)
def create_interview(data: InterviewCreate, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  job = crud.get_job(db, data.job_id)
  if not job:
    raise HTTPException(status_code=400, detail='Invalid job_id')
  resume = crud.get_resume(db, data.resume_id)
  if not resume:
    raise HTTPException(status_code=400, detail='Invalid resume_id')
  if resume.job_id != job.id:
    raise HTTPException(status_code=400, detail='Resume is not linked to the given job')

  created = crud.create_interview(db, data)
  return _to_out(created, job=job, resume=resume)


@router.get('/{interview_id}', response_model=InterviewOut)
def get_interview(interview_id: int, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  item = crud.get_interview(db, interview_id)
  if not item:
    raise HTTPException(status_code=404, detail='Interview not found')
  job = crud.get_job(db, item.job_id)
  resume = crud.get_resume(db, item.resume_id)
  return _to_out(item, job=job, resume=resume)


@router.put('/{interview_id}', response_model=InterviewOut)
def update_interview(interview_id: int, data: InterviewUpdate, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  item = crud.get_interview(db, interview_id)
  if not item:
    raise HTTPException(status_code=404, detail='Interview not found')
  updated = crud.update_interview(db, item, data)
  job = crud.get_job(db, updated.job_id)
  resume = crud.get_resume(db, updated.resume_id)
  return _to_out(updated, job=job, resume=resume)


@router.delete('/{interview_id}')
def delete_interview(interview_id: int, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  item = crud.get_interview(db, interview_id)
  if not item:
    raise HTTPException(status_code=404, detail='Interview not found')
  crud.delete_interview(db, item)
  return {'ok': True}
