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
InterviewStatus = Literal['scheduled', 'in_progress', 'interrupted', 'awaiting_review', 'completed', 'canceled']


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


class ResumeUpdate(APIModel):
  candidate_name: str | None = None
  job_id: int | None = None
  resume_text: str | None = None
  status: ResumeStatus | None = None
  education: str | None = None
  years_exp: int | None = None
  skills: list[str] | None = None


class ResumePdfParseOut(APIModel):
  filename: str
  extracted_text: str
  page_count: int


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
  extra_conditions: str | None = None


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


class AIAnalysisHistoryOut(AIAnalysisOut):
  source_analysis_id: int | None = None


class InterviewInsightRequest(APIModel):
  interview_id: int | None = None
  job_id: int | None = None
  resume_id: int | None = None
  candidate_name: str = ''
  interviewer: str = ''
  interview_round: str = ''
  transcript_text: str = ''
  notes_text: str = ''
  key_terms: list[str] = Field(default_factory=list)
  focus_priority: str = 'matching_score'
  context: dict[str, Any] = Field(default_factory=dict)
  recruiter_question: str = ''


class InterviewInsightOut(APIModel):
  provider: str
  model: str
  confidence: int
  matching_score: int
  communication_score: int
  technical_depth_score: int
  risk_flags: list[str] = Field(default_factory=list)
  key_signals: list[str] = Field(default_factory=list)
  recommendation: str
  follow_up_questions: list[str] = Field(default_factory=list)
  summary: str
  used_fallback: bool = False
  stt_validated_text: str = ''
  buffer_statement: str = ''
  structured_talking_points: list[str] = Field(default_factory=list)
  retrieved_cheatsheets: list[dict[str, Any]] = Field(default_factory=list)
  prompt_version: str = ''
  raw_response: dict[str, Any] = Field(default_factory=dict)


class InterviewMeetingTokenCreate(APIModel):
  interview_id: int | None = None
  room_name: str | None = None
  participant_name: str | None = None


class InterviewMeetingTokenOut(APIModel):
  room_name: str
  ws_url: str
  token: str
  participant_identity: str
  participant_display_name: str


class InterviewTranscriptEntryIn(APIModel):
  id: str
  text: str
  created_at: dt.datetime
  terms: list[str] = Field(default_factory=list)
  source: str = 'speech'


class InterviewTranscriptEntryOut(InterviewTranscriptEntryIn):
  session_id: int | None = None


class InterviewAssistantSessionStart(APIModel):
  room_name: str
  participant_identity: str
  participant_display_name: str = ''


class InterviewAssistantSessionSync(APIModel):
  session_id: int
  notes: str = ''
  partial_text: str = ''
  meeting_connected: bool | None = None
  transcript_entries: list[InterviewTranscriptEntryIn] = Field(default_factory=list)
  event_type: str | None = None
  event_payload: dict[str, Any] = Field(default_factory=dict)


class InterviewAssistantSessionEnd(APIModel):
  session_id: int
  reason: Literal['completed', 'disconnected', 'canceled'] = 'completed'
  notes: str = ''
  partial_text: str = ''


class InterviewAssistantSessionOut(APIModel):
  id: int
  interview_id: int
  room_name: str
  participant_identity: str
  participant_display_name: str
  status: str
  meeting_connected: bool
  notes_snapshot: str
  partial_text: str
  started_at: dt.datetime
  last_seen_at: dt.datetime
  ended_at: dt.datetime | None = None
  transcript_entries: list[InterviewTranscriptEntryOut] = Field(default_factory=list)
  event_count: int = 0


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


class AuthRegister(APIModel):
  username: str
  password: str


class AuthLogin(APIModel):
  username: str
  password: str


class TokenOut(APIModel):
  access_token: str
  refresh_token: str | None = None
  token_type: str = 'bearer'


class UserOut(APIModel):
  id: int
  username: str
  created_at: dt.datetime
  model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=_to_camel)
