from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings


PROMPT_VERSION = 'v1'


def build_prompt(*, job_title: str, job_department: str, job_description: str, required_skills: list[str], nice_to_have: list[str], resume_text: str) -> str:
  return (
    "你是一位資深招募顧問與面試官，請根據『職缺需求』與『履歷文字』輸出 JSON 分析結果。\n\n"
    "【重要規則】\n"
    "- 只輸出 JSON，禁止輸出其他文字。\n"
    "- 分數範圍 0~100，請避免不合理的滿分。\n"
    "- 請強調：AI 僅供參考，不做決策。\n\n"
    "【輸出 JSON 格式】\n"
    "{\n"
    '  "overall_score": 0,\n'
    '  "professional_score": 0,\n'
    '  "communication_score": 0,\n'
    '  "problem_solving_score": 0,\n'
    '  "summary": "",\n'
    '  "strengths": [""],\n'
    '  "risks": [""],\n'
    '  "suggested_questions": [""],\n'
    '  "disclaimer": "本分析結果僅供招募人員參考，最終決策由人類負責"\n'
    "}\n\n"
    "【職缺需求】\n"
    f"- 職缺：{job_title}\n"
    f"- 部門：{job_department}\n"
    f"- 工作內容：{job_description}\n"
    f"- 必要技能：{', '.join(required_skills) if required_skills else '未提供'}\n"
    f"- 加分條件：{', '.join(nice_to_have) if nice_to_have else '未提供'}\n\n"
    "【履歷文字】\n"
    f"{resume_text}\n"
  )


def _extract_json(text: str) -> dict[str, Any]:
  text = text.strip()

  if text.startswith('```'):
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()

  try:
    return json.loads(text)
  except json.JSONDecodeError:
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if not match:
      raise
    return json.loads(match.group(0))


async def generate_analysis(*, prompt: str) -> tuple[dict[str, Any], bool, str]:
  """Returns (parsed_json, is_mock, model_used)."""
  if not settings.gemini_api_key:
    return (
      {
        'overall_score': 78,
        'professional_score': 80,
        'communication_score': 72,
        'problem_solving_score': 76,
        'summary': '未提供 GEMINI_API_KEY，故使用 Mock 分析結果（可正常 demo 前後端串接）。',
        'strengths': ['具備與職缺相關的基礎能力', '履歷資訊完整度尚可'],
        'risks': ['需以面試確認實作深度與實際貢獻'],
        'suggested_questions': ['請分享一個最有代表性的專案與你的角色', '遇到 bug 或效能瓶頸時你的排查流程是什麼？'],
        'disclaimer': '本分析結果僅供招募人員參考，最終決策由人類負責',
      },
      True,
      settings.gemini_model,
    )

  url = f"{settings.gemini_endpoint}/{settings.gemini_model}:generateContent"
  payload = {
    'contents': [
      {
        'role': 'user',
        'parts': [{'text': prompt}],
      }
    ],
    'generationConfig': {
      'temperature': 0.2,
      'maxOutputTokens': 1024,
    },
  }

  async with httpx.AsyncClient(timeout=30) as client:
    resp = await client.post(url, params={'key': settings.gemini_api_key}, json=payload)
    resp.raise_for_status()
    data = resp.json()

  text = ''
  try:
    text = data['candidates'][0]['content']['parts'][0]['text']
  except Exception:
    text = json.dumps(data, ensure_ascii=False)

  parsed = _extract_json(text)
  return parsed, False, settings.gemini_model
