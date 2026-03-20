from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud, models
from app.core.config import settings
from app.deps import get_current_user
from app.db import get_db
from app.schemas import (
  CandidateMeetingTokenCreate,
  CandidateMeetingTokenOut,
  InterviewAssistantSessionEnd,
  InterviewAssistantSessionOut,
  InterviewAssistantSessionStart,
  InterviewAssistantSessionSync,
  InterviewCreate,
  InterviewMeetingTokenCreate,
  InterviewMeetingTokenOut,
  InterviewOut,
  InterviewTranscriptEntryOut,
  InterviewUpdate,
)
from app.services.livekit import issue_meeting_token, issue_candidate_meeting_token


router = APIRouter(prefix='/interviews', tags=['interviews'])


def _to_out(interview, job=None, resume=None) -> InterviewOut:
  return InterviewOut(
    **interview.__dict__,
    job_title=(job.title if job else None),
    department=(job.department if job else None),
    candidate_name=(resume.candidate_name if resume else None),
  )


def _to_session_out(db: Session, session) -> InterviewAssistantSessionOut:
  transcript_entries = [
    InterviewTranscriptEntryOut(
      id=item.entry_id,
      text=item.text,
      created_at=item.created_at,
      terms=list(item.terms or []),
      source=item.source,
      session_id=item.session_id,
    )
    for item in crud.list_transcript_entries_for_session(db, session.id)
  ]

  return InterviewAssistantSessionOut(
    id=session.id,
    interview_id=session.interview_id,
    room_name=session.room_name,
    participant_identity=session.participant_identity,
    participant_display_name=session.participant_display_name,
    status=session.status,
    meeting_connected=session.meeting_connected,
    notes_snapshot=session.notes_snapshot,
    partial_text=session.partial_text,
    started_at=session.started_at,
    last_seen_at=session.last_seen_at,
    ended_at=session.ended_at,
    transcript_entries=transcript_entries,
    event_count=crud.count_meeting_events_for_session(db, session.id),
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


@router.post('/meeting-token', response_model=InterviewMeetingTokenOut)
def create_interview_meeting_token(
  data: InterviewMeetingTokenCreate,
  db: Session = Depends(get_db),
  current_user: models.User = Depends(get_current_user),
):
  if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
    raise HTTPException(status_code=503, detail='LiveKit is not configured')

  room_name = (data.room_name or '').strip()

  if data.interview_id:
    interview = crud.get_interview(db, data.interview_id)
    if not interview:
      raise HTTPException(status_code=404, detail='Interview not found')
    room_name = room_name or f'interview-room-{interview.id}'

  if not room_name:
    raise HTTPException(status_code=400, detail='room_name is required when interview_id is not provided')

  return issue_meeting_token(
    room_name=room_name,
    current_user=current_user,
    participant_name=(data.participant_name or '').strip() or None,
  )


@router.post('/candidate-meeting-token', response_model=CandidateMeetingTokenOut)
def create_candidate_meeting_token(
  data: CandidateMeetingTokenCreate,
  db: Session = Depends(get_db),
):
  """为候选人生成会议 token，无需身份验证"""
  if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
    raise HTTPException(status_code=503, detail='LiveKit is not configured')

  # 通过 meeting_hash 查找 Interview
  interview = db.query(models.Interview).filter(models.Interview.meeting_hash == data.meeting_hash).first()
  if not interview:
    raise HTTPException(status_code=404, detail='Meeting hash not found')

  room_name = f'interview-room-{interview.id}'

  return issue_candidate_meeting_token(
    room_name=room_name,
    candidate_name=data.candidate_name,
    interview_id=interview.id,
    meeting_hash=data.meeting_hash,
  )


@router.get('/{interview_id}/assistant-session/latest', response_model=InterviewAssistantSessionOut | None)
def get_latest_interview_assistant_session(
  interview_id: int,
  db: Session = Depends(get_db),
  _current_user: models.User = Depends(get_current_user),
):
  interview = crud.get_interview(db, interview_id)
  if not interview:
    raise HTTPException(status_code=404, detail='Interview not found')

  session = crud.get_latest_interview_assistant_session(db, interview_id)
  if not session:
    return None
  return _to_session_out(db, session)


@router.post('/{interview_id}/assistant-session/start', response_model=InterviewAssistantSessionOut)
def start_interview_assistant_session(
  interview_id: int,
  data: InterviewAssistantSessionStart,
  db: Session = Depends(get_db),
  _current_user: models.User = Depends(get_current_user),
):
  interview = crud.get_interview(db, interview_id)
  if not interview:
    raise HTTPException(status_code=404, detail='Interview not found')

  session = crud.create_interview_assistant_session(db, interview=interview, data=data)
  crud.create_meeting_event(
    db,
    interview_id=interview.id,
    session_id=session.id,
    event_type='session_started',
    payload={'roomName': data.room_name, 'participantIdentity': data.participant_identity},
  )
  return _to_session_out(db, session)


@router.post('/{interview_id}/assistant-session/sync', response_model=InterviewAssistantSessionOut)
def sync_interview_assistant_session(
  interview_id: int,
  data: InterviewAssistantSessionSync,
  db: Session = Depends(get_db),
  _current_user: models.User = Depends(get_current_user),
):
  interview = crud.get_interview(db, interview_id)
  if not interview:
    raise HTTPException(status_code=404, detail='Interview not found')

  session = crud.get_interview_assistant_session(db, data.session_id)
  if not session or session.interview_id != interview_id:
    raise HTTPException(status_code=404, detail='Assistant session not found')

  session = crud.sync_interview_assistant_session(db, interview=interview, session=session, data=data)
  if data.event_type:
    crud.create_meeting_event(
      db,
      interview_id=interview.id,
      session_id=session.id,
      event_type=data.event_type,
      payload=data.event_payload,
    )
  return _to_session_out(db, session)


@router.post('/{interview_id}/assistant-session/end', response_model=InterviewAssistantSessionOut)
def end_interview_assistant_session(
  interview_id: int,
  data: InterviewAssistantSessionEnd,
  db: Session = Depends(get_db),
  _current_user: models.User = Depends(get_current_user),
):
  interview = crud.get_interview(db, interview_id)
  if not interview:
    raise HTTPException(status_code=404, detail='Interview not found')

  session = crud.get_interview_assistant_session(db, data.session_id)
  if not session or session.interview_id != interview_id:
    raise HTTPException(status_code=404, detail='Assistant session not found')

  session = crud.end_interview_assistant_session(db, interview=interview, session=session, data=data)
  crud.create_meeting_event(
    db,
    interview_id=interview.id,
    session_id=session.id,
    event_type='session_ended',
    payload={'reason': data.reason},
  )
  return _to_session_out(db, session)


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
