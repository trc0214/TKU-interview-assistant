from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.schemas import AIAnalysisOut, InterviewCreate, InterviewUpdate, JobCreate, JobUpdate, ResumeCreate


def list_jobs(db: Session) -> list[models.Job]:
  return list(db.scalars(select(models.Job).order_by(models.Job.created_at.desc())))


def get_job(db: Session, job_id: int) -> models.Job | None:
  return db.get(models.Job, job_id)


def create_job(db: Session, data: JobCreate) -> models.Job:
  job = models.Job(**data.model_dump())
  db.add(job)
  db.commit()
  db.refresh(job)
  return job


def update_job(db: Session, job: models.Job, data: JobUpdate) -> models.Job:
  patch = data.model_dump(exclude_unset=True)
  for k, v in patch.items():
    setattr(job, k, v)
  db.add(job)
  db.commit()
  db.refresh(job)
  return job


def delete_job(db: Session, job: models.Job) -> None:
  db.delete(job)
  db.commit()


def list_resumes(db: Session, job_id: int | None = None) -> list[models.Resume]:
  stmt = select(models.Resume).order_by(models.Resume.submitted_at.desc())
  if job_id is not None:
    stmt = stmt.where(models.Resume.job_id == job_id)
  return list(db.scalars(stmt))


def get_resume(db: Session, resume_id: int) -> models.Resume | None:
  return db.get(models.Resume, resume_id)


def create_resume(db: Session, data: ResumeCreate) -> models.Resume:
  resume = models.Resume(**data.model_dump())
  db.add(resume)
  db.commit()
  db.refresh(resume)
  return resume


def get_analysis_by_pair(db: Session, job_id: int, resume_id: int) -> models.AIAnalysis | None:
  stmt = select(models.AIAnalysis).where(models.AIAnalysis.job_id == job_id, models.AIAnalysis.resume_id == resume_id)
  return db.scalars(stmt).first()


def get_analysis(db: Session, analysis_id: int) -> models.AIAnalysis | None:
  return db.get(models.AIAnalysis, analysis_id)


def get_latest_analysis_for_resume(db: Session, resume_id: int) -> models.AIAnalysis | None:
  stmt = (
    select(models.AIAnalysis)
    .where(models.AIAnalysis.resume_id == resume_id)
    .order_by(models.AIAnalysis.created_at.desc())
    .limit(1)
  )
  return db.scalars(stmt).first()


def list_analyses(db: Session, job_id: int | None = None, resume_id: int | None = None) -> list[models.AIAnalysis]:
  stmt = select(models.AIAnalysis).order_by(models.AIAnalysis.created_at.desc())
  if job_id is not None:
    stmt = stmt.where(models.AIAnalysis.job_id == job_id)
  if resume_id is not None:
    stmt = stmt.where(models.AIAnalysis.resume_id == resume_id)
  return list(db.scalars(stmt))


def list_interviews(
  db: Session,
  job_id: int | None = None,
  resume_id: int | None = None,
  status: str | None = None,
) -> list[models.Interview]:
  stmt = select(models.Interview).order_by(models.Interview.created_at.desc())
  if job_id is not None:
    stmt = stmt.where(models.Interview.job_id == job_id)
  if resume_id is not None:
    stmt = stmt.where(models.Interview.resume_id == resume_id)
  if status is not None:
    stmt = stmt.where(models.Interview.status == status)
  return list(db.scalars(stmt))


def get_interview(db: Session, interview_id: int) -> models.Interview | None:
  return db.get(models.Interview, interview_id)


def create_interview(db: Session, data: InterviewCreate) -> models.Interview:
  interview = models.Interview(**data.model_dump())
  db.add(interview)
  db.commit()
  db.refresh(interview)
  return interview


def update_interview(db: Session, interview: models.Interview, data: InterviewUpdate) -> models.Interview:
  patch = data.model_dump(exclude_unset=True)
  for k, v in patch.items():
    setattr(interview, k, v)
  # manual updated_at
  import datetime as dt

  interview.updated_at = dt.datetime.utcnow()
  db.add(interview)
  db.commit()
  db.refresh(interview)
  return interview


def delete_interview(db: Session, interview: models.Interview) -> None:
  db.delete(interview)
  db.commit()


def get_user_by_username(db: Session, username: str) -> models.User | None:
  return db.query(models.User).filter(models.User.username == username).first()


def create_user(db: Session, *, username: str, password_hash: str) -> models.User:
  user = models.User(username=username, password_hash=password_hash)
  db.add(user)
  db.commit()
  db.refresh(user)
  return user
