from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx

from app.core.config import settings


PROMPT_VERSION = 'v2'


def _mock_analysis(*, summary: str) -> dict[str, Any]:
  return {
    'overall_score': 78,
    'professional_score': 80,
    'communication_score': 72,
    'problem_solving_score': 76,
    'summary': summary,
    'strengths': ['具備與職缺相關的基礎能力', '履歷資訊完整度尚可'],
    'risks': ['需以面試確認實作深度與實際貢獻'],
    'suggested_questions': ['請分享一個最有代表性的專案與你的角色', '遇到 bug 或效能瓶頸時你的排查流程是什麼？'],
    'disclaimer': '本分析結果僅供招募人員參考，最終決策由人類負責',
  }


def _redact_api_key(message: str) -> str:
  if not message:
    return message
  if settings.gemini_api_key and settings.gemini_api_key in message:
    return message.replace(settings.gemini_api_key, '***')
  return message


def _redact_url_query(url: str) -> str:
  try:
    parsed = urlparse(url)
    if not parsed.query:
      return url
    return urlunparse(parsed._replace(query=''))
  except Exception:
    return url


def _build_generate_content_urls() -> list[str]:
  endpoint = (settings.gemini_endpoint or '').rstrip('/')
  model = (settings.gemini_model or '').strip()

  if model.startswith('models/'):
    model = model.removeprefix('models/')

  # Accept either:
  # - https://.../v1beta/models
  # - https://.../v1beta
  # - https://.../v1
  if endpoint.endswith('/models'):
    base_models = endpoint
  else:
    base_models = f"{endpoint}/models"

  primary = f"{base_models}/{model}:generateContent"
  urls = [primary]

  # Fallback between v1beta <-> v1 (Google has shifted versions over time).
  if '/v1beta' in primary:
    urls.append(primary.replace('/v1beta', '/v1'))
  elif '/v1' in primary:
    urls.append(primary.replace('/v1', '/v1beta'))

  # De-duplicate while preserving order.
  seen: set[str] = set()
  out: list[str] = []
  for u in urls:
    if u not in seen:
      seen.add(u)
      out.append(u)
  return out


async def _try_list_models(*, client: httpx.AsyncClient) -> list[str] | None:
  endpoint = (settings.gemini_endpoint or '').rstrip('/')
  models_url = endpoint if endpoint.endswith('/models') else f"{endpoint}/models"
  candidates = [models_url]
  if '/v1beta' in models_url:
    candidates.append(models_url.replace('/v1beta', '/v1'))
  elif '/v1' in models_url:
    candidates.append(models_url.replace('/v1', '/v1beta'))

  for url in candidates:
    try:
      resp = await client.get(url, params={'key': settings.gemini_api_key})
      if resp.status_code >= 400:
        continue
      data = resp.json()
      models = data.get('models')
      if not isinstance(models, list):
        continue
      names: list[str] = []
      for m in models:
        if isinstance(m, dict) and isinstance(m.get('name'), str):
          # e.g. "models/gemini-1.5-flash"
          names.append(m['name'])
      return names[:20]
    except Exception:
      continue
  return None


def build_prompt(
  *,
  job_title: str,
  job_department: str,
  job_description: str,
  required_skills: list[str],
  nice_to_have: list[str],
  resume_text: str,
  extra_conditions: str | None = None,
) -> str:
  extra = (extra_conditions or '').strip()

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
    + (
      "【附加條件】\n"
      + f"{extra}\n\n"
      if extra
      else ''
    )
    + "【履歷文字】\n"
    + f"{resume_text}\n"
  )


def _extract_json(text: str) -> dict[str, Any]:
  def extract_first_json_object(raw: str) -> str | None:
    start = raw.find('{')
    if start == -1:
      return None

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(raw)):
      ch = raw[i]

      if escape:
        escape = False
        continue

      if ch == '\\' and in_string:
        escape = True
        continue

      if ch == '"':
        in_string = not in_string
        continue

      if in_string:
        continue

      if ch == '{':
        depth += 1
      elif ch == '}':
        depth -= 1
        if depth == 0:
          return raw[start : i + 1]
    return None

  text = text.strip()

  # Handle fenced blocks even when the model adds prefatory text.
  if '```' in text:
    fenced = re.search(r'```(?:json)?\s*(.*?)\s*```', text, re.DOTALL | re.IGNORECASE)
    if fenced and fenced.group(1).strip():
      text = fenced.group(1).strip()

  try:
    return json.loads(text)
  except json.JSONDecodeError:
    extracted = extract_first_json_object(text)
    if extracted is None:
      raise
    return json.loads(extracted)


async def generate_analysis(*, prompt: str) -> tuple[dict[str, Any], bool, str]:
  """Returns (parsed_json, is_mock, model_used)."""
  if not settings.gemini_api_key:
    return (_mock_analysis(summary='未提供 GEMINI_API_KEY，故使用 Mock 分析結果（可正常 demo 前後端串接）。'), True, settings.gemini_model)

  def build_payload(*, prompt_text: str, max_output_tokens: int, temperature: float) -> dict[str, Any]:
    return {
      'contents': [
        {
          'role': 'user',
          'parts': [{'text': prompt_text}],
        }
      ],
      'generationConfig': {
        'temperature': temperature,
        'maxOutputTokens': max_output_tokens,
        # Ask Gemini to respond with valid JSON if supported by the API version.
        'responseMimeType': 'application/json',
      },
    }

  # More room reduces the chance of truncated JSON.
  payload = build_payload(prompt_text=prompt, max_output_tokens=2048, temperature=0.2)

  urls_to_try = _build_generate_content_urls()
  last_error: str | None = None
  data: dict[str, Any] | None = None

  async with httpx.AsyncClient(timeout=30) as client:
    for url in urls_to_try:
      try:
        resp = await client.post(url, params={'key': settings.gemini_api_key}, json=payload)
        resp.raise_for_status()
        data = resp.json()
        break
      except httpx.HTTPStatusError as exc:
        # Avoid leaking API key in returned error message.
        safe_url = _redact_url_query(str(exc.request.url))
        resp_text = ''
        try:
          resp_text = exc.response.text
        except Exception:
          resp_text = ''
        resp_text = _redact_api_key(resp_text)
        last_error = (
          f"HTTP {exc.response.status_code} from {_redact_api_key(safe_url)}"
          + (f"; body={resp_text[:500]}" if resp_text else '')
        )

        # If the model or version is wrong, listing models helps users fix config quickly.
        if exc.response.status_code == 404:
          models = await _try_list_models(client=client)
          if models:
            last_error += f"; available_models(sample)={models}"
        continue
      except httpx.HTTPError as exc:
        last_error = _redact_api_key(f"{type(exc).__name__}: {str(exc)}")
        continue

  if data is None:
    return (
      _mock_analysis(summary=f"Gemini 呼叫失敗，故使用 Mock 分析結果（{last_error or 'unknown error'}）。"),
      True,
      settings.gemini_model,
    )

  text = ''
  try:
    text = data['candidates'][0]['content']['parts'][0]['text']
  except Exception:
    text = json.dumps(data, ensure_ascii=False)

  try:
    parsed = _extract_json(text)
    return parsed, False, settings.gemini_model
  except Exception as exc:
    # Retry once with a shorter/stricter prompt (models sometimes truncate or add extra text).
    safe = _redact_api_key(str(exc))
    snippet = _redact_api_key(text[:500])

    retry_prompt = (
      "請只輸出『有效 JSON』，禁止輸出任何說明文字或 Markdown。\n"
      "請用最短文字回答，每個陣列最多 3 項。\n\n"
      "JSON 必須符合以下欄位：\n"
      "{\n"
      "  \"overall_score\": 0,\n"
      "  \"professional_score\": 0,\n"
      "  \"communication_score\": 0,\n"
      "  \"problem_solving_score\": 0,\n"
      "  \"summary\": \"\",\n"
      "  \"strengths\": [\"\"],\n"
      "  \"risks\": [\"\"],\n"
      "  \"suggested_questions\": [\"\"],\n"
      "  \"disclaimer\": \"本分析結果僅供招募人員參考，最終決策由人類負責\"\n"
      "}\n\n"
      "請根據以下內容重新生成：\n\n"
      + prompt
    )

    retry_payload = build_payload(prompt_text=retry_prompt, max_output_tokens=2048, temperature=0.0)
    data2: dict[str, Any] | None = None
    last_error2: str | None = None
    async with httpx.AsyncClient(timeout=30) as client:
      for url in urls_to_try:
        try:
          resp = await client.post(url, params={'key': settings.gemini_api_key}, json=retry_payload)
          resp.raise_for_status()
          data2 = resp.json()
          break
        except httpx.HTTPStatusError as exc2:
          safe_url = _redact_url_query(str(exc2.request.url))
          resp_text = ''
          try:
            resp_text = exc2.response.text
          except Exception:
            resp_text = ''
          resp_text = _redact_api_key(resp_text)
          last_error2 = (
            f"HTTP {exc2.response.status_code} from {_redact_api_key(safe_url)}"
            + (f"; body={resp_text[:300]}" if resp_text else '')
          )
          continue
        except httpx.HTTPError as exc2:
          last_error2 = _redact_api_key(f"{type(exc2).__name__}: {str(exc2)}")
          continue

    if data2 is not None:
      text2 = ''
      try:
        text2 = data2['candidates'][0]['content']['parts'][0]['text']
      except Exception:
        text2 = json.dumps(data2, ensure_ascii=False)

      try:
        parsed2 = _extract_json(text2)
        return parsed2, False, settings.gemini_model
      except Exception as exc2:
        safe2 = _redact_api_key(str(exc2))
        snippet2 = _redact_api_key(text2[:500])
        return (
          _mock_analysis(
            summary=(
              f"Gemini 回傳非合法 JSON，重試後仍失敗，改用 Mock（first={safe}; retry={safe2}; retry_err={last_error2 or 'none'}）。 "
              f"raw_snippet={snippet}; retry_snippet={snippet2}"
            )
          ),
          True,
          settings.gemini_model,
        )

    # Demo-friendly behavior: if the model returns malformed JSON, fall back to a deterministic mock
    # instead of 500'ing the API.
    return (
      _mock_analysis(summary=f"Gemini 回傳非合法 JSON，改用 Mock 分析結果（{safe}）。 raw_snippet={snippet}"),
      True,
      settings.gemini_model,
    )
