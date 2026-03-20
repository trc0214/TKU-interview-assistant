from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
  pass


class Job(Base):
  __tablename__ = 'jobs'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  title: Mapped[str] = mapped_column(String(200), nullable=False)
  department: Mapped[str] = mapped_column(String(120), nullable=False)
  description: Mapped[str] = mapped_column(Text, nullable=False, default='')
  required_skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  nice_to_have: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  status: Mapped[str] = mapped_column(String(20), nullable=False, default='open')
  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)

  experience_level: Mapped[str] = mapped_column(String(20), nullable=False, default='2-3')
  education: Mapped[str] = mapped_column(String(20), nullable=False, default='大學')

  ai_resume_matching_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
  ai_question_gen_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

  resumes: Mapped[list['Resume']] = relationship(back_populates='job', cascade='all, delete-orphan')
  interviews: Mapped[list['Interview']] = relationship(back_populates='job', cascade='all, delete-orphan')


class User(Base):
  __tablename__ = 'users'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
  password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)


class Resume(Base):
  __tablename__ = 'resumes'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  candidate_name: Mapped[str] = mapped_column(String(120), nullable=False)
  job_id: Mapped[int] = mapped_column(ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False)
  resume_text: Mapped[str] = mapped_column(Text, nullable=False)

  status: Mapped[str] = mapped_column(String(20), nullable=False, default='received')
  submitted_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)

  education: Mapped[str] = mapped_column(String(200), nullable=False, default='')
  years_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

  job: Mapped['Job'] = relationship(back_populates='resumes')
  analyses: Mapped[list['AIAnalysis']] = relationship(back_populates='resume', cascade='all, delete-orphan')
  analysis_history: Mapped[list['AIAnalysisHistory']] = relationship(back_populates='resume', cascade='all, delete-orphan')
  interviews: Mapped[list['Interview']] = relationship(back_populates='resume', cascade='all, delete-orphan')


class AIAnalysis(Base):
  __tablename__ = 'ai_analyses'
  __table_args__ = (UniqueConstraint('job_id', 'resume_id', name='uq_ai_analyses_job_resume'),)

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  job_id: Mapped[int] = mapped_column(ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False)
  resume_id: Mapped[int] = mapped_column(ForeignKey('resumes.id', ondelete='CASCADE'), nullable=False)

  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)
  model: Mapped[str] = mapped_column(String(80), nullable=False, default='gemini-1.5-flash')
  prompt_version: Mapped[str] = mapped_column(String(40), nullable=False, default='v1')

  overall_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  professional_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  communication_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  problem_solving_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

  summary: Mapped[str] = mapped_column(Text, nullable=False, default='')
  strengths: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  risks: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  suggested_questions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

  raw_response: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
  is_mock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

  resume: Mapped['Resume'] = relationship(back_populates='analyses')


class AIAnalysisHistory(Base):
  __tablename__ = 'ai_analysis_history'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  job_id: Mapped[int] = mapped_column(ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False)
  resume_id: Mapped[int] = mapped_column(ForeignKey('resumes.id', ondelete='CASCADE'), nullable=False)
  source_analysis_id: Mapped[int | None] = mapped_column(ForeignKey('ai_analyses.id', ondelete='SET NULL'), nullable=True)

  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)
  model: Mapped[str] = mapped_column(String(80), nullable=False, default='gemini-1.5-flash')
  prompt_version: Mapped[str] = mapped_column(String(40), nullable=False, default='v1')

  overall_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  professional_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  communication_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  problem_solving_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

  summary: Mapped[str] = mapped_column(Text, nullable=False, default='')
  strengths: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  risks: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  suggested_questions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

  raw_response: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
  is_mock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

  resume: Mapped['Resume'] = relationship(back_populates='analysis_history')


class Interview(Base):
  __tablename__ = 'interviews'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

  job_id: Mapped[int] = mapped_column(ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False)
  resume_id: Mapped[int] = mapped_column(ForeignKey('resumes.id', ondelete='CASCADE'), nullable=False)

  scheduled_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
  status: Mapped[str] = mapped_column(String(20), nullable=False, default='scheduled')

  interview_round: Mapped[str] = mapped_column(String(40), nullable=False, default='')
  interviewer: Mapped[str] = mapped_column(String(120), nullable=False, default='')
  meeting_link: Mapped[str] = mapped_column(String(400), nullable=False, default='')
  meeting_hash: Mapped[str] = mapped_column(String(36), nullable=False, default=lambda: str(uuid.uuid4()), unique=True, index=True)
  location: Mapped[str] = mapped_column(String(200), nullable=False, default='')

  notes: Mapped[str] = mapped_column(Text, nullable=False, default='')
  decision: Mapped[str] = mapped_column(String(20), nullable=False, default='')
  rating: Mapped[int | None] = mapped_column(Integer, nullable=True)

  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)
  updated_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)

  job: Mapped['Job'] = relationship(back_populates='interviews')
  resume: Mapped['Resume'] = relationship(back_populates='interviews')
  assistant_sessions: Mapped[list['InterviewAssistantSession']] = relationship(back_populates='interview', cascade='all, delete-orphan')
  transcript_entries: Mapped[list['InterviewTranscriptEntry']] = relationship(back_populates='interview', cascade='all, delete-orphan')
  meeting_events: Mapped[list['InterviewMeetingEvent']] = relationship(back_populates='interview', cascade='all, delete-orphan')


class InterviewAssistantSession(Base):
  __tablename__ = 'interview_assistant_sessions'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  interview_id: Mapped[int] = mapped_column(ForeignKey('interviews.id', ondelete='CASCADE'), nullable=False, index=True)
  room_name: Mapped[str] = mapped_column(String(160), nullable=False, default='')
  participant_identity: Mapped[str] = mapped_column(String(160), nullable=False, default='')
  participant_display_name: Mapped[str] = mapped_column(String(160), nullable=False, default='')
  status: Mapped[str] = mapped_column(String(30), nullable=False, default='active')
  meeting_connected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  notes_snapshot: Mapped[str] = mapped_column(Text, nullable=False, default='')
  partial_text: Mapped[str] = mapped_column(Text, nullable=False, default='')
  started_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)
  last_seen_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)
  ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)
  updated_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)

  interview: Mapped['Interview'] = relationship(back_populates='assistant_sessions')
  transcript_entries: Mapped[list['InterviewTranscriptEntry']] = relationship(back_populates='session', cascade='all, delete-orphan')
  meeting_events: Mapped[list['InterviewMeetingEvent']] = relationship(back_populates='session', cascade='all, delete-orphan')


class InterviewTranscriptEntry(Base):
  __tablename__ = 'interview_transcript_entries'
  __table_args__ = (UniqueConstraint('interview_id', 'entry_id', name='uq_interview_transcript_entry'),)

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  interview_id: Mapped[int] = mapped_column(ForeignKey('interviews.id', ondelete='CASCADE'), nullable=False, index=True)
  session_id: Mapped[int | None] = mapped_column(ForeignKey('interview_assistant_sessions.id', ondelete='SET NULL'), nullable=True, index=True)
  entry_id: Mapped[str] = mapped_column(String(120), nullable=False)
  text: Mapped[str] = mapped_column(Text, nullable=False, default='')
  terms: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  source: Mapped[str] = mapped_column(String(30), nullable=False, default='speech')
  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)

  interview: Mapped['Interview'] = relationship(back_populates='transcript_entries')
  session: Mapped['InterviewAssistantSession | None'] = relationship(back_populates='transcript_entries')


class InterviewMeetingEvent(Base):
  __tablename__ = 'interview_meeting_events'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  interview_id: Mapped[int] = mapped_column(ForeignKey('interviews.id', ondelete='CASCADE'), nullable=False, index=True)
  session_id: Mapped[int | None] = mapped_column(ForeignKey('interview_assistant_sessions.id', ondelete='SET NULL'), nullable=True, index=True)
  event_type: Mapped[str] = mapped_column(String(60), nullable=False, default='session_sync')
  payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)

  interview: Mapped['Interview'] = relationship(back_populates='meeting_events')
  session: Mapped['InterviewAssistantSession | None'] = relationship(back_populates='meeting_events')
