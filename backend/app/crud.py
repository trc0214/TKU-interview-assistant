from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.schemas import InterviewAssistantSessionEnd, InterviewAssistantSessionStart, InterviewAssistantSessionSync, InterviewCreate, InterviewUpdate, JobCreate, JobUpdate, ResumeCreate, ResumeUpdate


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


def update_resume(db: Session, resume: models.Resume, data: ResumeUpdate) -> models.Resume:
  patch = data.model_dump(exclude_unset=True)
  for key, value in patch.items():
    setattr(resume, key, value)
  db.add(resume)
  db.commit()
  db.refresh(resume)
  return resume


def delete_resume(db: Session, resume: models.Resume) -> None:
  db.delete(resume)
  db.commit()


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


def list_analysis_history(db: Session, job_id: int | None = None, resume_id: int | None = None) -> list[models.AIAnalysisHistory]:
  stmt = select(models.AIAnalysisHistory).order_by(models.AIAnalysisHistory.created_at.desc())
  if job_id is not None:
    stmt = stmt.where(models.AIAnalysisHistory.job_id == job_id)
  if resume_id is not None:
    stmt = stmt.where(models.AIAnalysisHistory.resume_id == resume_id)
  return list(db.scalars(stmt))


def create_analysis_history(db: Session, analysis: models.AIAnalysis) -> models.AIAnalysisHistory:
  history = models.AIAnalysisHistory(
    job_id=analysis.job_id,
    resume_id=analysis.resume_id,
    source_analysis_id=analysis.id,
    model=analysis.model,
    prompt_version=analysis.prompt_version,
    overall_score=analysis.overall_score,
    professional_score=analysis.professional_score,
    communication_score=analysis.communication_score,
    problem_solving_score=analysis.problem_solving_score,
    summary=analysis.summary,
    strengths=list(analysis.strengths or []),
    risks=list(analysis.risks or []),
    suggested_questions=list(analysis.suggested_questions or []),
    raw_response=dict(analysis.raw_response or {}),
    is_mock=analysis.is_mock,
  )
  db.add(history)
  db.commit()
  db.refresh(history)
  return history


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


def get_latest_interview_assistant_session(db: Session, interview_id: int) -> models.InterviewAssistantSession | None:
  stmt = (
    select(models.InterviewAssistantSession)
    .where(models.InterviewAssistantSession.interview_id == interview_id)
    .order_by(models.InterviewAssistantSession.started_at.desc())
    .limit(1)
  )
  return db.scalars(stmt).first()


def get_interview_assistant_session(db: Session, session_id: int) -> models.InterviewAssistantSession | None:
  return db.get(models.InterviewAssistantSession, session_id)


def list_transcript_entries_for_session(db: Session, session_id: int) -> list[models.InterviewTranscriptEntry]:
  stmt = (
    select(models.InterviewTranscriptEntry)
    .where(models.InterviewTranscriptEntry.session_id == session_id)
    .order_by(models.InterviewTranscriptEntry.created_at.asc())
  )
  return list(db.scalars(stmt))


def count_meeting_events_for_session(db: Session, session_id: int) -> int:
  stmt = select(func.count(models.InterviewMeetingEvent.id)).where(models.InterviewMeetingEvent.session_id == session_id)
  return int(db.scalar(stmt) or 0)


def create_meeting_event(
  db: Session,
  *,
  interview_id: int,
  session_id: int | None,
  event_type: str,
  payload: dict,
) -> models.InterviewMeetingEvent:
  event = models.InterviewMeetingEvent(
    interview_id=interview_id,
    session_id=session_id,
    event_type=event_type,
    payload=payload,
  )
  db.add(event)
  db.commit()
  db.refresh(event)
  return event


def create_interview_assistant_session(
  db: Session,
  *,
  interview: models.Interview,
  data: InterviewAssistantSessionStart,
) -> models.InterviewAssistantSession:
  now = dt.datetime.utcnow()
  session = models.InterviewAssistantSession(
    interview_id=interview.id,
    room_name=data.room_name,
    participant_identity=data.participant_identity,
    participant_display_name=data.participant_display_name,
    status='active',
    meeting_connected=False,
    started_at=now,
    last_seen_at=now,
    updated_at=now,
  )
  interview.status = 'in_progress'
  interview.updated_at = now
  db.add(session)
  db.add(interview)
  db.commit()
  db.refresh(session)
  return session


def sync_interview_assistant_session(
  db: Session,
  *,
  interview: models.Interview,
  session: models.InterviewAssistantSession,
  data: InterviewAssistantSessionSync,
) -> models.InterviewAssistantSession:
  now = dt.datetime.utcnow()
  session.notes_snapshot = data.notes
  session.partial_text = data.partial_text
  session.last_seen_at = now
  session.updated_at = now
  if data.meeting_connected is not None:
    session.meeting_connected = data.meeting_connected
    if data.meeting_connected:
      session.status = 'active'
      interview.status = 'in_progress'

  if data.notes.strip():
    interview.notes = data.notes
  interview.updated_at = now

  existing_ids = set(
    db.scalars(
      select(models.InterviewTranscriptEntry.entry_id).where(models.InterviewTranscriptEntry.interview_id == interview.id)
    )
  )

  for entry in data.transcript_entries:
    if entry.id in existing_ids:
      continue
    db.add(
      models.InterviewTranscriptEntry(
        interview_id=interview.id,
        session_id=session.id,
        entry_id=entry.id,
        text=entry.text,
        terms=list(entry.terms or []),
        source=entry.source,
        created_at=entry.created_at,
      )
    )
    existing_ids.add(entry.id)

  db.add(session)
  db.add(interview)
  db.commit()
  db.refresh(session)
  return session


def end_interview_assistant_session(
  db: Session,
  *,
  interview: models.Interview,
  session: models.InterviewAssistantSession,
  data: InterviewAssistantSessionEnd,
) -> models.InterviewAssistantSession:
  now = dt.datetime.utcnow()
  session.notes_snapshot = data.notes
  session.partial_text = data.partial_text
  session.meeting_connected = False
  session.last_seen_at = now
  session.ended_at = now
  session.updated_at = now

  if data.reason == 'completed':
    session.status = 'completed'
    interview.status = 'awaiting_review'
  elif data.reason == 'canceled':
    session.status = 'canceled'
    interview.status = 'canceled'
  else:
    session.status = 'disconnected'
    interview.status = 'interrupted'

  if data.notes.strip():
    interview.notes = data.notes
  interview.updated_at = now

  db.add(session)
  db.add(interview)
  db.commit()
  db.refresh(session)
  return session
