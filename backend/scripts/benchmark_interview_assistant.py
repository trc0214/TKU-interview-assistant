from __future__ import annotations

import asyncio
import json
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.interview_assistant_generation import generate_interview_coaching  # noqa: E402
from app.services.interview_assistant_pipeline import infer_ai_interview_assistant  # noqa: E402
from app.services.interview_assistant_retrieval import get_cheatsheet_retriever  # noqa: E402
from app.services.unified_speech import SpeechRecognitionResult, UnifiedSpeechService  # noqa: E402


ARTIFACT_DIR = BACKEND_ROOT / 'artifacts'


RETRIEVAL_CASES: list[dict[str, str]] = [
  {
    'name': 'rag_design',
    'query': 'How do you design retrieval augmented generation with query rewrite and citation-aware synthesis?',
    'transcript_text': 'We grounded the answer in retrieval augmented generation and citation-aware synthesis.',
    'notes_text': 'Mention query rewrite, context grounding, and citation awareness.',
    'expected_title': 'RAG System Design',
  },
  {
    'name': 'mcp_tooling',
    'query': 'How would you explain secure tool invocation and capability discovery in Model Context Protocol?',
    'transcript_text': 'The answer should describe secure capability discovery and structured tool invocation.',
    'notes_text': 'Focus on model context protocol, policy governance, and tool contracts.',
    'expected_title': 'Model Context Protocol Integration',
  },
  {
    'name': 'vector_db',
    'query': 'How do you compare HNSW, IVF, metadata filtering, and hybrid search for vector databases?',
    'transcript_text': 'Discuss embeddings, latency-recall tradeoffs, and reranking in a vector database.',
    'notes_text': 'Emphasize HNSW, IVF, and hybrid search with metadata filters.',
    'expected_title': 'Vector DB Interview Talking Points',
  },
  {
    'name': 'reliability',
    'query': 'How would you build an async system with bounded queues, graceful degradation, and p95 latency monitoring?',
    'transcript_text': 'Use observability metrics, retry budgets, and graceful degradation under load.',
    'notes_text': 'Mention p95 latency, timeout rate, and throughput.',
    'expected_title': 'System Reliability Under Load',
  },
  {
    'name': 'communication',
    'query': 'How do you structure an interview answer with scope, trade-offs, and measurable outcomes?',
    'transcript_text': 'Structure the response in three steps with outcomes and risk mitigation.',
    'notes_text': 'Show clear communication and a measurable result.',
    'expected_title': 'Technical Communication Framework',
  },
]


GENERATION_CASES: list[dict[str, Any]] = [
  {
    'name': 'backend_scaling',
    'recruiter_question': 'How would you scale the interview assistant backend for multiple interviewers?',
    'transcript_text': 'We use async FastAPI, bounded queues, and separate transcription and generation services.',
    'notes_text': 'Need concise, grounded answer about scaling and reliability.',
    'key_terms': ['FastAPI', 'async', 'queue', 'observability'],
  },
  {
    'name': 'retrieval_quality',
    'recruiter_question': 'How do you make RAG answers more reliable and less hallucinated?',
    'transcript_text': 'We ground answers in retrieved context and keep the response structured.',
    'notes_text': 'Need follow-up questions and a grounded summary.',
    'key_terms': ['RAG', 'grounding', 'citation', 'retrieval'],
  },
  {
    'name': 'speech_fallback',
    'recruiter_question': 'How does the system fail over when cloud speech recognition is unavailable?',
    'transcript_text': 'Azure is primary and Whisper is the offline fallback.',
    'notes_text': 'Need a reliable, technical answer with a concrete fallback path.',
    'key_terms': ['Azure Speech', 'Whisper', 'fallback'],
  },
]


PIPELINE_CASES: list[dict[str, Any]] = [
  {
    'name': 'interview_flow',
    'recruiter_question': 'How would you explain your approach to improving interview note-taking accuracy?',
    'transcript_text': '  We keep the transcript clean, retrieve relevant context, and generate structured reminders. ',
    'notes_text': 'Focus on accuracy, consistency, and measurable outcomes.',
    'key_terms': ['notes', 'accuracy', 'retrieval'],
  },
  {
    'name': 'system_tradeoffs',
    'recruiter_question': 'What trade-offs did you make in the assistant architecture?',
    'transcript_text': 'We separated services to lower coupling and improve fallback reliability.',
    'notes_text': 'Need a concise structured answer.',
    'key_terms': ['architecture', 'fallback', 'coupling'],
  },
]


class _FakeAzureService:
  def __init__(self, *, configured: bool, response: dict[str, Any] | None = None, error: str | None = None):
    self._configured = configured
    self._response = response or {}
    self._error = error

  def is_configured(self) -> bool:
    return self._configured

  async def transcribe_audio_bytes(self, audio_data: bytes, language: str | None = None, filename: str | None = None, content_type: str | None = None) -> dict[str, Any]:
    if self._error:
      return {
        'text': '',
        'language': language or 'unknown',
        'confidence': 0,
        'words': [],
        'raw_json': {},
        'error': self._error,
      }
    return {
      'text': self._response.get('text', 'azure transcript'),
      'language': language or self._response.get('language', 'zh-TW'),
      'confidence': self._response.get('confidence', 0.91),
      'words': self._response.get('words', []),
      'raw_json': self._response.get('raw_json', {'provider': 'azure'}),
      'error': self._response.get('error'),
    }


class _FakeWhisperService:
  def __init__(self, *, enabled: bool, response: dict[str, Any] | None = None, error: str | None = None):
    self._enabled = enabled
    self._response = response or {}
    self._error = error

  def is_enabled(self) -> bool:
    return self._enabled

  async def transcribe_audio_bytes(self, audio_data: bytes, language: str | None = None, filename: str | None = None, content_type: str | None = None) -> dict[str, Any]:
    if self._error:
      return {
        'text': '',
        'language': language or 'unknown',
        'confidence': 0,
        'segments': [],
        'raw_output': {},
        'error': self._error,
      }
    return {
      'text': self._response.get('text', 'whisper transcript'),
      'language': language or self._response.get('language', 'zh'),
      'confidence': self._response.get('confidence', 0.78),
      'segments': self._response.get('segments', []),
      'raw_output': self._response.get('raw_output', {'provider': 'whisper'}),
      'error': self._response.get('error'),
    }


def _mean(values: list[float]) -> float:
  return statistics.mean(values) if values else 0.0


def _median(values: list[float]) -> float:
  return statistics.median(values) if values else 0.0


def _is_valid_generation_payload(payload: dict[str, Any]) -> bool:
  required_keys = {
    'bufferStatement',
    'structuredTalkingPoints',
    'summary',
    'riskFlags',
    'keySignals',
    'followUpQuestions',
    'matchingScore',
    'communicationScore',
    'technicalDepthScore',
    'confidence',
    'recommendation',
  }
  if not required_keys.issubset(payload.keys()):
    return False

  if str(payload.get('recommendation')) not in {'pass', 'hold', 'reject'}:
    return False

  for key in ['matchingScore', 'communicationScore', 'technicalDepthScore', 'confidence']:
    try:
      value = int(payload.get(key))
    except Exception:
      return False
    if value < 0 or value > 100:
      return False

  if not isinstance(payload.get('structuredTalkingPoints'), list) or len(payload['structuredTalkingPoints']) != 3:
    return False
  if not isinstance(payload.get('followUpQuestions'), list) or len(payload['followUpQuestions']) < 1:
    return False
  if not str(payload.get('summary') or '').strip():
    return False

  return True


async def benchmark_retrieval() -> dict[str, Any]:
  retriever = get_cheatsheet_retriever()
  cases: list[dict[str, Any]] = []
  top1_hits = 0
  top3_hits = 0
  latencies: list[float] = []

  for case in RETRIEVAL_CASES:
    start = time.perf_counter()
    chunks = await retriever.retrieve(
      query=case['query'],
      transcript_text=case['transcript_text'],
      notes_text=case['notes_text'],
    )
    latency_ms = (time.perf_counter() - start) * 1000
    latencies.append(latency_ms)

    titles = [chunk.title for chunk in chunks]
    top1_match = bool(titles) and titles[0] == case['expected_title']
    top3_match = case['expected_title'] in titles[:3]
    top1_hits += int(top1_match)
    top3_hits += int(top3_match)

    cases.append(
      {
        'name': case['name'],
        'expected_title': case['expected_title'],
        'top_titles': titles[:3],
        'top1_match': top1_match,
        'top3_match': top3_match,
        'latency_ms': round(latency_ms, 2),
      }
    )

  return {
    'cases': cases,
    'summary': {
      'case_count': len(RETRIEVAL_CASES),
      'top1_accuracy': round(top1_hits / len(RETRIEVAL_CASES), 4),
      'top3_recall': round(top3_hits / len(RETRIEVAL_CASES), 4),
      'avg_latency_ms': round(_mean(latencies), 2),
      'median_latency_ms': round(_median(latencies), 2),
    },
  }


async def benchmark_generation() -> dict[str, Any]:
  original_key = settings.gemini_api_key
  settings.gemini_api_key = None

  try:
    cases: list[dict[str, Any]] = []
    valid_count = 0
    deterministic_count = 0
    latencies: list[float] = []

    for case in GENERATION_CASES:
      start = time.perf_counter()
      payload, model_name, used_fallback = await generate_interview_coaching(
        recruiter_question=case['recruiter_question'],
        transcript_text=case['transcript_text'],
        notes_text=case['notes_text'],
        key_terms=case['key_terms'],
        cheatsheets=[
          {
            'title': 'RAG System Design',
            'content': 'Use retrieval-augmented generation with clear pipeline and citation-aware synthesis.',
            'tags': ['rag'],
            'score': 0.95,
          }
        ],
      )
      latency_ms = (time.perf_counter() - start) * 1000
      latencies.append(latency_ms)

      start_repeat = time.perf_counter()
      payload_repeat, _, used_fallback_repeat = await generate_interview_coaching(
        recruiter_question=case['recruiter_question'],
        transcript_text=case['transcript_text'],
        notes_text=case['notes_text'],
        key_terms=case['key_terms'],
        cheatsheets=[
          {
            'title': 'RAG System Design',
            'content': 'Use retrieval-augmented generation with clear pipeline and citation-aware synthesis.',
            'tags': ['rag'],
            'score': 0.95,
          }
        ],
      )
      repeat_latency_ms = (time.perf_counter() - start_repeat) * 1000
      latencies.append(repeat_latency_ms)

      is_valid = _is_valid_generation_payload(payload)
      deterministic = payload == payload_repeat and used_fallback and used_fallback_repeat
      valid_count += int(is_valid)
      deterministic_count += int(deterministic)

      cases.append(
        {
          'name': case['name'],
          'model': model_name,
          'used_fallback': used_fallback,
          'valid_payload': is_valid,
          'deterministic_repeat': deterministic,
          'confidence': payload.get('confidence'),
          'matchingScore': payload.get('matchingScore'),
          'communicationScore': payload.get('communicationScore'),
          'technicalDepthScore': payload.get('technicalDepthScore'),
          'recommendation': payload.get('recommendation'),
          'summary': payload.get('summary'),
          'follow_up_questions_count': len(payload.get('followUpQuestions') or []),
          'latency_ms': round(latency_ms, 2),
          'repeat_latency_ms': round(repeat_latency_ms, 2),
        }
      )

    return {
      'cases': cases,
      'summary': {
        'case_count': len(GENERATION_CASES),
        'valid_payload_rate': round(valid_count / len(GENERATION_CASES), 4),
        'deterministic_rate': round(deterministic_count / len(GENERATION_CASES), 4),
        'avg_latency_ms': round(_mean(latencies), 2),
        'median_latency_ms': round(_median(latencies), 2),
      },
    }
  finally:
    settings.gemini_api_key = original_key


async def benchmark_pipeline() -> dict[str, Any]:
  original_key = settings.gemini_api_key
  settings.gemini_api_key = None

  try:
    cases: list[dict[str, Any]] = []
    valid_count = 0
    latencies: list[float] = []

    for case in PIPELINE_CASES:
      start = time.perf_counter()
      insight = await infer_ai_interview_assistant(
        recruiter_question=case['recruiter_question'],
        transcript_text=case['transcript_text'],
        notes_text=case['notes_text'],
        key_terms=case['key_terms'],
      )
      latency_ms = (time.perf_counter() - start) * 1000
      latencies.append(latency_ms)

      is_valid = (
        insight.used_fallback
        and insight.prompt_version
        and len(insight.structured_talking_points) == 3
        and insight.recommendation in {'pass', 'hold', 'reject'}
        and 0 <= insight.confidence <= 100
        and 0 <= insight.matching_score <= 100
        and 0 <= insight.communication_score <= 100
        and 0 <= insight.technical_depth_score <= 100
        and bool(insight.buffer_statement.strip())
        and bool(insight.summary.strip())
      )
      valid_count += int(is_valid)

      cases.append(
        {
          'name': case['name'],
          'used_fallback': insight.used_fallback,
          'confidence': insight.confidence,
          'matching_score': insight.matching_score,
          'communication_score': insight.communication_score,
          'technical_depth_score': insight.technical_depth_score,
          'recommendation': insight.recommendation,
          'structured_talking_points_count': len(insight.structured_talking_points),
          'retrieved_cheatsheets_top': insight.retrieved_cheatsheets[0]['title'] if insight.retrieved_cheatsheets else None,
          'valid_output': is_valid,
          'latency_ms': round(latency_ms, 2),
        }
      )

    return {
      'cases': cases,
      'summary': {
        'case_count': len(PIPELINE_CASES),
        'valid_output_rate': round(valid_count / len(PIPELINE_CASES), 4),
        'avg_latency_ms': round(_mean(latencies), 2),
        'median_latency_ms': round(_median(latencies), 2),
      },
    }
  finally:
    settings.gemini_api_key = original_key


async def benchmark_speech_routing() -> dict[str, Any]:
  cases: list[dict[str, Any]] = []

  routing_scenarios = [
    {
      'name': 'azure_primary',
      'prefer_local': False,
      'azure': _FakeAzureService(configured=True, response={'text': 'azure success', 'confidence': 0.94}),
      'whisper': _FakeWhisperService(enabled=True, response={'text': 'whisper success', 'confidence': 0.81}),
      'expected_provider': 'azure',
      'expected_used_fallback': False,
    },
    {
      'name': 'prefer_local_whisper',
      'prefer_local': True,
      'azure': _FakeAzureService(configured=True, response={'text': 'azure success', 'confidence': 0.94}),
      'whisper': _FakeWhisperService(enabled=True, response={'text': 'whisper success', 'confidence': 0.81}),
      'expected_provider': 'whisper',
      'expected_used_fallback': False,
    },
    {
      'name': 'azure_failover_whisper',
      'prefer_local': False,
      'azure': _FakeAzureService(configured=True, error='Azure service unavailable'),
      'whisper': _FakeWhisperService(enabled=True, response={'text': 'whisper fallback', 'confidence': 0.79}),
      'expected_provider': 'whisper',
      'expected_used_fallback': True,
    },
    {
      'name': 'no_service_available',
      'prefer_local': False,
      'azure': _FakeAzureService(configured=False),
      'whisper': _FakeWhisperService(enabled=False),
      'expected_provider': 'none',
      'expected_used_fallback': False,
    },
  ]

  correct_count = 0
  for scenario in routing_scenarios:
    service = UnifiedSpeechService()
    service.azure_service = scenario['azure']
    service.whisper_service = scenario['whisper']

    result = await service.transcribe(b'audio-bytes', language='zh-TW', prefer_local=scenario['prefer_local'])
    actual_provider = result.provider
    if scenario['expected_provider'] == 'none':
      actual_provider = 'none' if not result.text and result.error else actual_provider

    is_correct = actual_provider == scenario['expected_provider'] and result.used_fallback == scenario['expected_used_fallback']
    correct_count += int(is_correct)

    cases.append(
      {
        'name': scenario['name'],
        'provider': result.provider,
        'used_fallback': result.used_fallback,
        'text': result.text,
        'confidence': result.confidence,
        'error': result.error,
        'correct': is_correct,
      }
    )

  return {
    'cases': cases,
    'summary': {
      'case_count': len(routing_scenarios),
      'correct_rate': round(correct_count / len(routing_scenarios), 4),
    },
  }


def _render_markdown_report(report: dict[str, Any]) -> str:
  lines = [
    '# Interview Assistant Benchmark Report',
    '',
    f"Generated at: {report['generated_at']}",
    '',
    '## Summary',
    '',
  ]

  for section_name, section in report['sections'].items():
    summary = section['summary']
    lines.append(f'### {section_name}')
    for key, value in summary.items():
      lines.append(f'- {key}: {value}')
    lines.append('')

  lines.append('## Case Details')
  lines.append('')
  for section_name, section in report['sections'].items():
    lines.append(f'### {section_name}')
    lines.append('')
    for case in section['cases']:
      lines.append(f"- {case['name']}: {json.dumps(case, ensure_ascii=False)}")
    lines.append('')

  return '\n'.join(lines).strip() + '\n'


async def run_benchmark() -> dict[str, Any]:
  sections = {
    'retrieval': await benchmark_retrieval(),
    'generation': await benchmark_generation(),
    'pipeline': await benchmark_pipeline(),
    'speech_routing': await benchmark_speech_routing(),
  }

  report = {
    'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
    'sections': sections,
  }

  ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
  json_path = ARTIFACT_DIR / 'interview_assistant_benchmark_report.json'
  md_path = ARTIFACT_DIR / 'interview_assistant_benchmark_report.md'
  json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
  md_path.write_text(_render_markdown_report(report), encoding='utf-8')
  return report


def main() -> None:
  report = asyncio.run(run_benchmark())
  print(json.dumps(report['sections'], ensure_ascii=False, indent=2))
  print(f"\nSaved: {ARTIFACT_DIR / 'interview_assistant_benchmark_report.json'}")
  print(f"Saved: {ARTIFACT_DIR / 'interview_assistant_benchmark_report.md'}")


if __name__ == '__main__':
  main()