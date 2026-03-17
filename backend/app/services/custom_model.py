from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings
from app.schemas import InterviewInsightOut, InterviewInsightRequest


def _clamp_score(value: Any, default: int = 0) -> int:
  try:
    return max(0, min(100, int(value)))
  except Exception:
    return default


def _extract_json(text: str) -> dict[str, Any]:
  raw = (text or '').strip()
  if not raw:
    raise ValueError('empty model response')

  if '```' in raw:
    fenced = re.search(r'```(?:json)?\s*(.*?)\s*```', raw, re.DOTALL | re.IGNORECASE)
    if fenced and fenced.group(1).strip():
      raw = fenced.group(1).strip()

  try:
    return json.loads(raw)
  except json.JSONDecodeError:
    start = raw.find('{')
    if start == -1:
      raise

    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(raw)):
      char = raw[index]
      if escape:
        escape = False
        continue
      if char == '\\' and in_string:
        escape = True
        continue
      if char == '"':
        in_string = not in_string
        continue
      if in_string:
        continue
      if char == '{':
        depth += 1
      elif char == '}':
        depth -= 1
        if depth == 0:
          return json.loads(raw[start : index + 1])

    raise


def _build_payload(request_data: InterviewInsightRequest) -> dict[str, Any]:
  transcript_preview = request_data.transcript_text[:6000]
  notes_preview = request_data.notes_text[:3000]
  context = request_data.context or {}

  return {
    'task': 'interview_decision_support',
    'focusPriority': request_data.focus_priority,
    'metadata': {
      'interviewId': request_data.interview_id,
      'jobId': request_data.job_id,
      'resumeId': request_data.resume_id,
      'candidateName': request_data.candidate_name,
      'interviewer': request_data.interviewer,
      'interviewRound': request_data.interview_round,
    },
    'inputs': {
      'transcript': transcript_preview,
      'notes': notes_preview,
      'keyTerms': request_data.key_terms,
      'context': context,
    },
    'outputSchema': {
      'matchingScore': '0-100',
      'communicationScore': '0-100',
      'technicalDepthScore': '0-100',
      'confidence': '0-100',
      'recommendation': 'pass|hold|reject',
      'summary': 'string',
      'riskFlags': ['string'],
      'keySignals': ['string'],
      'followUpQuestions': ['string'],
    },
  }


def _to_output(*, parsed: dict[str, Any], used_fallback: bool, provider: str) -> InterviewInsightOut:
  recommendation = str(parsed.get('recommendation') or 'hold').strip().lower()
  if recommendation not in {'pass', 'hold', 'reject'}:
    recommendation = 'hold'

  return InterviewInsightOut(
    provider=provider,
    model=str(parsed.get('model') or settings.custom_model_name),
    confidence=_clamp_score(parsed.get('confidence'), default=60),
    matching_score=_clamp_score(parsed.get('matchingScore'), default=0),
    communication_score=_clamp_score(parsed.get('communicationScore'), default=0),
    technical_depth_score=_clamp_score(parsed.get('technicalDepthScore'), default=0),
    risk_flags=list(parsed.get('riskFlags') or []),
    key_signals=list(parsed.get('keySignals') or []),
    recommendation=recommendation,
    follow_up_questions=list(parsed.get('followUpQuestions') or []),
    summary=str(parsed.get('summary') or '').strip(),
    used_fallback=used_fallback,
    raw_response=parsed,
  )


def _fallback_insight(request_data: InterviewInsightRequest, reason: str) -> InterviewInsightOut:
  transcript = (request_data.transcript_text or '').strip()
  key_terms = request_data.key_terms or []
  transcript_length = len(transcript)

  baseline = 40
  if transcript_length > 600:
    baseline += 12
  if transcript_length > 1500:
    baseline += 14
  if len(key_terms) >= 5:
    baseline += 10

  matching_score = max(0, min(100, baseline))
  communication_score = max(0, min(100, baseline - 5))
  technical_depth_score = max(0, min(100, baseline + (8 if len(key_terms) >= 8 else 0)))

  recommendation = 'hold'
  if matching_score >= 80:
    recommendation = 'pass'
  elif matching_score < 55:
    recommendation = 'reject'

  summary = (
    'Custom model unavailable, switched to guarded heuristic scoring to keep workflow unblocked. '
    f'Reason: {reason[:180]}'
  )

  parsed = {
    'model': 'fallback-heuristic',
    'confidence': 35,
    'matchingScore': matching_score,
    'communicationScore': communication_score,
    'technicalDepthScore': technical_depth_score,
    'recommendation': recommendation,
    'summary': summary,
    'riskFlags': ['Model inference unavailable'],
    'keySignals': key_terms[:6],
    'followUpQuestions': [
      '請舉例一個你主導解決的實際問題。',
      '如何在壓力情境下維持溝通品質？'
    ],
  }
  return _to_output(parsed=parsed, used_fallback=True, provider='fallback')


async def infer_interview_insight(request_data: InterviewInsightRequest) -> InterviewInsightOut:
  endpoint = (settings.custom_model_endpoint or '').strip()
  if not endpoint:
    return _fallback_insight(request_data, 'CUSTOM_MODEL_ENDPOINT not configured')

  payload = _build_payload(request_data)
  headers: dict[str, str] = {'Content-Type': 'application/json'}

  if settings.custom_model_api_key:
    auth_header = (settings.custom_model_auth_header or 'Authorization').strip() or 'Authorization'
    if auth_header.lower() == 'authorization':
      scheme = (settings.custom_model_auth_scheme or 'Bearer').strip() or 'Bearer'
      headers[auth_header] = f'{scheme} {settings.custom_model_api_key}'.strip()
    else:
      headers[auth_header] = settings.custom_model_api_key

  try:
    async with httpx.AsyncClient(timeout=max(3, settings.custom_model_timeout_seconds)) as client:
      response = await client.post(endpoint, headers=headers, json=payload)
      response.raise_for_status()

    content_type = response.headers.get('content-type', '')
    if 'application/json' in content_type.lower():
      parsed = response.json()
    else:
      parsed = _extract_json(response.text)

    if not isinstance(parsed, dict):
      return _fallback_insight(request_data, 'invalid response shape')

    return _to_output(parsed=parsed, used_fallback=False, provider='custom-model')
  except httpx.HTTPStatusError as error:
    return _fallback_insight(request_data, f'HTTP {error.response.status_code}')
  except Exception as error:
    return _fallback_insight(request_data, str(error))
