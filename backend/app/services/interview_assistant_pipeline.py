from __future__ import annotations

import re
from typing import Any

from app.schemas import InterviewInsightOut
from app.services.interview_assistant_generation import INTERVIEW_ASSISTANT_PROMPT_VERSION, generate_interview_coaching
from app.services.interview_assistant_retrieval import get_cheatsheet_retriever


DEFAULT_RECRUITER_QUESTION = 'Please explain your approach in a technical and structured way.'


def _clamp_score(value: Any, default: int = 0) -> int:
  try:
    return max(0, min(100, int(value)))
  except Exception:
    return default


def validate_stt_text(raw_text: str) -> str:
  cleaned = re.sub(r'\s+', ' ', (raw_text or '').strip())
  if len(cleaned) < 2:
    return ''
  cleaned = cleaned.replace(' ,', ',').replace(' .', '.')
  return cleaned[:8000]


def _normalize_three_steps(items: list[Any]) -> list[str]:
  normalized = [str(item).strip() for item in items if str(item).strip()]
  if len(normalized) >= 3:
    return normalized[:3]

  fallback = [
    'Step 1 — Clarify the scope and define the success metric.',
    'Step 2 — Present technical approach with trade-offs and risks.',
    'Step 3 — Close with measurable impact and validation plan.',
  ]
  return (normalized + fallback)[:3]


async def infer_ai_interview_assistant(
  *,
  recruiter_question: str,
  transcript_text: str,
  notes_text: str,
  key_terms: list[str],
) -> InterviewInsightOut:
  stt_validated_text = validate_stt_text(transcript_text)
  effective_question = (recruiter_question or '').strip() or DEFAULT_RECRUITER_QUESTION

  retriever = get_cheatsheet_retriever()
  cheat_chunks = await retriever.retrieve(
    query=effective_question,
    transcript_text=stt_validated_text,
    notes_text=notes_text,
  )
  cheatsheet_payload = [
    {
      'title': chunk.title,
      'content': chunk.content,
      'tags': chunk.tags,
      'score': round(chunk.score, 4),
    }
    for chunk in cheat_chunks
  ]

  parsed, model_name, used_fallback = await generate_interview_coaching(
    recruiter_question=effective_question,
    transcript_text=stt_validated_text,
    notes_text=notes_text,
    key_terms=key_terms,
    cheatsheets=cheatsheet_payload,
  )

  recommendation = str(parsed.get('recommendation') or 'hold').strip().lower()
  if recommendation not in {'pass', 'hold', 'reject'}:
    recommendation = 'hold'

  three_steps = _normalize_three_steps(list(parsed.get('structuredTalkingPoints') or []))
  buffer_statement = str(parsed.get('bufferStatement') or '').strip() or (
    'Great question. Let me structure this in three technical steps.'
  )

  return InterviewInsightOut(
    provider='ai-interview-assistant',
    model=model_name,
    confidence=_clamp_score(parsed.get('confidence'), default=65),
    matching_score=_clamp_score(parsed.get('matchingScore'), default=0),
    communication_score=_clamp_score(parsed.get('communicationScore'), default=0),
    technical_depth_score=_clamp_score(parsed.get('technicalDepthScore'), default=0),
    risk_flags=[str(item) for item in list(parsed.get('riskFlags') or [])],
    key_signals=[str(item) for item in list(parsed.get('keySignals') or [])],
    recommendation=recommendation,
    follow_up_questions=[str(item) for item in list(parsed.get('followUpQuestions') or [])],
    summary=str(parsed.get('summary') or '').strip(),
    used_fallback=used_fallback,
    stt_validated_text=stt_validated_text,
    buffer_statement=buffer_statement,
    structured_talking_points=three_steps,
    retrieved_cheatsheets=cheatsheet_payload,
    prompt_version=INTERVIEW_ASSISTANT_PROMPT_VERSION,
    raw_response=parsed,
  )
