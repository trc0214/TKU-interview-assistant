from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.schemas import ResumeCreate, ResumeOut


router = APIRouter(prefix='/resumes', tags=['resumes'])


@router.get('', response_model=list[ResumeOut])
def list_resumes(job_id: int | None = Query(default=None), db: Session = Depends(get_db)):
  items = crud.list_resumes(db, job_id=job_id)
  out: list[ResumeOut] = []
  for r in items:
    latest = crud.get_latest_analysis_for_resume(db, r.id)
    out.append(
      ResumeOut(
        **r.__dict__,
        applied_job_title=(r.job.title if getattr(r, 'job', None) else None),
        ai_match_score=(latest.overall_score if latest else None),
        ai_summary=(latest.summary if latest else None),
        match_highlights=(list(latest.strengths)[:5] if latest and latest.strengths else []),
        analysis_id=(latest.id if latest else None),
      )
    )
  return out


@router.post('', response_model=ResumeOut)
def create_resume(data: ResumeCreate, db: Session = Depends(get_db)):
  job = crud.get_job(db, data.job_id)
  if not job:
    raise HTTPException(status_code=400, detail='Invalid job_id')
  resume = crud.create_resume(db, data)
  return ResumeOut(**resume.__dict__, applied_job_title=job.title)


@router.get('/{resume_id}', response_model=ResumeOut)
def get_resume(resume_id: int, db: Session = Depends(get_db)):
  resume = crud.get_resume(db, resume_id)
  if not resume:
    raise HTTPException(status_code=404, detail='Resume not found')
  job = crud.get_job(db, resume.job_id)
  latest = crud.get_latest_analysis_for_resume(db, resume.id)
  return ResumeOut(
    **resume.__dict__,
    applied_job_title=(job.title if job else None),
    ai_match_score=(latest.overall_score if latest else None),
    ai_summary=(latest.summary if latest else None),
    match_highlights=(list(latest.strengths)[:5] if latest and latest.strengths else []),
    analysis_id=(latest.id if latest else None),
  )
