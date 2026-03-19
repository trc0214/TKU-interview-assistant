from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings
from app.services.gemini import _build_generate_content_urls


INTERVIEW_ASSISTANT_PROMPT_VERSION = 'v3-ai-assistant'


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


def _build_system_prompt(*, recruiter_question: str, cheatsheets: list[dict[str, Any]]) -> str:
  sheets = '\n'.join(
    [
      f"- {item.get('title', 'CheatSheet')}: {item.get('content', '')}"
      for item in cheatsheets
    ]
  )

  return (
    'You are an expert AI interview copilot. Be professional, supportive, and technically precise.\n'
    'Always respond with strict JSON and no extra text.\n'
    'Use only grounded context from transcript and retrieved cheatsheets.\n\n'
    'Target recruiter question:\n'
    f'{recruiter_question}\n\n'
    'Retrieved cheatsheets:\n'
    f'{sheets}\n\n'
    'Return JSON schema:\n'
    '{\n'
    '  "bufferStatement": "one concise sentence to buy time",\n'
    '  "structuredTalkingPoints": ["step 1", "step 2", "step 3"],\n'
    '  "summary": "high-signal summary",\n'
    '  "riskFlags": ["string"],\n'
    '  "keySignals": ["string"],\n'
    '  "followUpQuestions": ["string"],\n'
    '  "matchingScore": 0,\n'
    '  "communicationScore": 0,\n'
    '  "technicalDepthScore": 0,\n'
    '  "confidence": 0,\n'
    '  "recommendation": "pass|hold|reject"\n'
    '}\n'
  )


def _build_user_prompt(*, transcript_text: str, notes_text: str, key_terms: list[str]) -> str:
  return (
    'Transcript:\n'
    f'{transcript_text[:7000]}\n\n'
    'Notes:\n'
    f'{notes_text[:3000]}\n\n'
    'Detected key terms:\n'
    f'{", ".join(key_terms[:30]) if key_terms else "none"}\n'
  )


def _fallback_generation(*, recruiter_question: str, cheatsheets: list[dict[str, Any]]) -> dict[str, Any]:
  top = cheatsheets[0] if cheatsheets else {'title': 'Core Structure', 'content': 'Clarify scope, approach, and impact.'}
  return {
    'bufferStatement': 'Great question. Let me structure this in three focused steps so the trade-offs are clear.',
    'structuredTalkingPoints': [
      'Step 1 — Clarify scope and success metric: align on problem boundaries, users impacted, and baseline metric.',
      'Step 2 — Explain technical approach and trade-offs: describe architecture choices, risk controls, and alternatives.',
      'Step 3 — Close with measurable outcome: share implementation plan, expected impact, and validation method.',
    ],
    'summary': f'Prioritize a concise, metric-driven answer grounded in {top.get("title", "retrieved context")}.',
    'riskFlags': ['Model fallback response in use'],
    'keySignals': [str(top.get('title', 'CheatSheet'))],
    'followUpQuestions': [
      f'Which metric best reflects success for this question: "{recruiter_question[:120]}"?',
      'What trade-off did you deliberately accept, and how did you mitigate the downside?',
    ],
    'matchingScore': 70,
    'communicationScore': 74,
    'technicalDepthScore': 72,
    'confidence': 58,
    'recommendation': 'hold',
  }


async def generate_interview_coaching(
  *,
  recruiter_question: str,
  transcript_text: str,
  notes_text: str,
  key_terms: list[str],
  cheatsheets: list[dict[str, Any]],
) -> tuple[dict[str, Any], str, bool]:
  system_prompt = _build_system_prompt(recruiter_question=recruiter_question, cheatsheets=cheatsheets)
  user_prompt = _build_user_prompt(transcript_text=transcript_text, notes_text=notes_text, key_terms=key_terms)

  if not settings.gemini_api_key:
    return _fallback_generation(recruiter_question=recruiter_question, cheatsheets=cheatsheets), 'fallback', True

  urls = _build_generate_content_urls()
  last_error: Exception | None = None

  for url in urls:
    try:
      async with httpx.AsyncClient(timeout=max(5, settings.custom_model_timeout_seconds)) as client:
        response = await client.post(
          url,
          params={'key': settings.gemini_api_key},
          json={
            'contents': [
              {
                'role': 'user',
                'parts': [
                  {'text': system_prompt},
                  {'text': user_prompt},
                ],
              }
            ],
            'generationConfig': {
              'temperature': 0.3,
              'responseMimeType': 'application/json',
            },
          },
        )

      response.raise_for_status()
      payload = response.json()
      candidates = payload.get('candidates') if isinstance(payload, dict) else None
      first = candidates[0] if isinstance(candidates, list) and candidates else {}
      content = first.get('content') if isinstance(first, dict) else {}
      parts = content.get('parts') if isinstance(content, dict) else []
      text = ''
      if isinstance(parts, list):
        for part in parts:
          if isinstance(part, dict) and isinstance(part.get('text'), str):
            text += part['text']

      parsed = _extract_json(text)
      if not isinstance(parsed, dict):
        raise ValueError('invalid response payload type')

      return parsed, settings.gemini_model, False
    except Exception as error:
      last_error = error
      continue

  fallback = _fallback_generation(recruiter_question=recruiter_question, cheatsheets=cheatsheets)
  if last_error:
    fallback['riskFlags'] = list(fallback.get('riskFlags') or []) + [f'Model error: {str(last_error)[:120]}']
  return fallback, 'fallback', True
