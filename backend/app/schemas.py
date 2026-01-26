from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
  parts = value.split('_')
  return parts[0] + ''.join(p[:1].upper() + p[1:] for p in parts[1:])


class APIModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True, alias_generator=_to_camel)


JobStatus = Literal['open', 'closed']
ResumeStatus = Literal['received', 'analyzed', 'interviewed']
InterviewStatus = Literal['scheduled', 'completed', 'canceled']


class JobBase(APIModel):
  title: str
  department: str
  description: str = ''
  required_skills: list[str] = Field(default_factory=list)
  nice_to_have: list[str] = Field(default_factory=list)
  status: JobStatus = 'open'
  experience_level: str = '2-3'
  education: str = '大學'
  ai_resume_matching_enabled: bool = True
  ai_question_gen_enabled: bool = True


class JobCreate(JobBase):
  pass


class JobUpdate(APIModel):
  title: str | None = None
  department: str | None = None
  description: str | None = None
  required_skills: list[str] | None = None
  nice_to_have: list[str] | None = None
  status: JobStatus | None = None
  experience_level: str | None = None
  education: str | None = None
  ai_resume_matching_enabled: bool | None = None
  ai_question_gen_enabled: bool | None = None


class JobOut(JobBase):
  id: int
  created_at: dt.datetime
  model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=_to_camel)


class ResumeBase(APIModel):
  candidate_name: str
  job_id: int
  resume_text: str
  status: ResumeStatus = 'received'
  education: str = ''
  years_exp: int = 0
  skills: list[str] = Field(default_factory=list)


class ResumeCreate(ResumeBase):
  pass


class ResumeOut(ResumeBase):
  id: int
  submitted_at: dt.datetime
  applied_job_title: str | None = None
  ai_match_score: int | None = None
  ai_summary: str | None = None
  match_highlights: list[str] = Field(default_factory=list)
  analysis_id: int | None = None
  model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=_to_camel)


class AIAnalysisCreate(APIModel):
  job_id: int
  resume_id: int
  force: bool = False


class AIAnalysisOut(APIModel):
  id: int
  job_id: int
  resume_id: int
  created_at: dt.datetime
  model: str
  prompt_version: str

  overall_score: int
  professional_score: int
  communication_score: int
  problem_solving_score: int

  summary: str
  strengths: list[str]
  risks: list[str]
  suggested_questions: list[str]

  is_mock: bool
  raw_response: dict[str, Any]
  model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=_to_camel)


class InterviewBase(APIModel):
  job_id: int
  resume_id: int
  scheduled_at: dt.datetime | None = None
  status: InterviewStatus = 'scheduled'

  interview_round: str = ''
  interviewer: str = ''
  meeting_link: str = ''
  location: str = ''

  notes: str = ''
  decision: str = ''
  rating: int | None = None


class InterviewCreate(InterviewBase):
  pass


class InterviewUpdate(APIModel):
  scheduled_at: dt.datetime | None = None
  status: InterviewStatus | None = None

  interview_round: str | None = None
  interviewer: str | None = None
  meeting_link: str | None = None
  location: str | None = None

  notes: str | None = None
  decision: str | None = None
  rating: int | None = None


class InterviewOut(InterviewBase):
  id: int
  created_at: dt.datetime
  updated_at: dt.datetime

  job_title: str | None = None
  department: str | None = None
  candidate_name: str | None = None
  model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=_to_camel)
