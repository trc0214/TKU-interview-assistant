from __future__ import annotations

import datetime as dt

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
  location: Mapped[str] = mapped_column(String(200), nullable=False, default='')

  notes: Mapped[str] = mapped_column(Text, nullable=False, default='')
  decision: Mapped[str] = mapped_column(String(20), nullable=False, default='')
  rating: Mapped[int | None] = mapped_column(Integer, nullable=True)

  created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)
  updated_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=dt.datetime.utcnow)

  job: Mapped['Job'] = relationship(back_populates='interviews')
  resume: Mapped['Resume'] = relationship(back_populates='interviews')
