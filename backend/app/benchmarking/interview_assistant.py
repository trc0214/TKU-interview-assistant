from __future__ import annotations

import asyncio
import copy
import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.services.interview_assistant_pipeline import infer_ai_interview_assistant, validate_stt_text
from app.services.interview_assistant_retrieval import VectorCheatSheetRetriever
from app.services.unified_speech import SpeechRecognitionResult, UnifiedSpeechService


@dataclass(frozen=True)
class PipelineBenchmarkCase:
  name: str
  recruiter_question: str
  transcript_text: str
  notes_text: str
  key_terms: list[str]
  expected_top_title: str


@dataclass(frozen=True)
class SpeechRoutingBenchmarkCase:
  name: str
  audio_data: bytes
  prefer_local: bool
  azure_configured: bool
  whisper_enabled: bool
  azure_result: dict[str, Any]
  whisper_result: dict[str, Any]
  expected_provider: str
  expected_used_fallback: bool
  expected_error_contains: str | None = None


PIPELINE_CASES: list[PipelineBenchmarkCase] = [
  PipelineBenchmarkCase(
    name='rag_system_design',
    recruiter_question='How would you design a RAG pipeline with query rewrite and context grounding?',
    transcript_text='We use retrieval augmented generation with citations and grounded context.',
    notes_text='candidate discussed query rewrite, reranking, and response synthesis.',
    key_terms=['RAG', 'retrieval', 'grounding'],
    expected_top_title='RAG System Design',
  ),
  PipelineBenchmarkCase(
    name='vector_db_tradeoffs',
    recruiter_question='How do you choose between HNSW and IVF for vector DB search?',
    transcript_text='Mention metadata filtering, hybrid search, and latency-recall tradeoffs.',
    notes_text='asked about reranking and embedding index tuning.',
    key_terms=['vector db', 'embeddings', 'HNSW'],
    expected_top_title='Vector DB Interview Talking Points',
  ),
  PipelineBenchmarkCase(
    name='mcp_integration',
    recruiter_question='Explain secure tool invocation and policy-governed actions in MCP.',
    transcript_text='Discussed structured tool interface and secure capability discovery.',
    notes_text='policy controls and standardized interfaces were emphasized.',
    key_terms=['MCP', 'tooling', 'agent'],
    expected_top_title='Model Context Protocol Integration',
  ),
  PipelineBenchmarkCase(
    name='system_reliability',
    recruiter_question='How would you keep an async pipeline reliable under load?',
    transcript_text='Bounded queues, retry budget, observability metrics, and graceful degradation.',
    notes_text='p95 latency, timeout rate, token throughput.',
    key_terms=['latency', 'reliability', 'performance'],
    expected_top_title='System Reliability Under Load',
  ),
  PipelineBenchmarkCase(
    name='communication_framework',
    recruiter_question='How do you structure a technical interview answer with clear trade-offs and measurable outcomes?',
    transcript_text='Clarify scope, show the approach, then close with measurable impact.',
    notes_text='three-step structure was used.',
    key_terms=['communication', 'interview', 'structure'],
    expected_top_title='Technical Communication Framework',
  ),
]


SPEECH_ROUTING_CASES: list[SpeechRoutingBenchmarkCase] = [
  SpeechRoutingBenchmarkCase(
    name='empty_audio',
    audio_data=b'',
    prefer_local=False,
    azure_configured=False,
    whisper_enabled=False,
    azure_result={},
    whisper_result={},
    expected_provider='none',
    expected_used_fallback=False,
    expected_error_contains='Empty audio data',
  ),
  SpeechRoutingBenchmarkCase(
    name='prefer_local_success',
    audio_data=b'fake-audio-bytes',
    prefer_local=True,
    azure_configured=True,
    whisper_enabled=True,
    azure_result={'text': 'azure should be skipped', 'error': None, 'confidence': 0.91, 'language': 'zh-TW'},
    whisper_result={'text': 'local whisper success', 'error': None, 'confidence': 0.82, 'language': 'zh-TW'},
    expected_provider='whisper',
    expected_used_fallback=False,
  ),
  SpeechRoutingBenchmarkCase(
    name='whisper_fallback_after_azure_failure',
    audio_data=b'fake-audio-bytes',
    prefer_local=False,
    azure_configured=True,
    whisper_enabled=True,
    azure_result={'text': '', 'error': 'Azure service error: timeout', 'confidence': 0.0, 'language': 'zh-TW'},
    whisper_result={'text': 'fallback whisper success', 'error': None, 'confidence': 0.77, 'language': 'zh-TW'},
    expected_provider='whisper',
    expected_used_fallback=True,
  ),
  SpeechRoutingBenchmarkCase(
    name='azure_no_speech_is_final',
    audio_data=b'fake-audio-bytes',
    prefer_local=False,
    azure_configured=True,
    whisper_enabled=True,
    azure_result={'text': '', 'error': 'No speech detected in audio', 'confidence': 0.0, 'language': 'zh-TW'},
    whisper_result={'text': 'fallback should not run', 'error': None, 'confidence': 0.77, 'language': 'zh-TW'},
    expected_provider='azure',
    expected_used_fallback=False,
    expected_error_contains='No speech detected',
  ),
  SpeechRoutingBenchmarkCase(
    name='no_service_available',
    audio_data=b'fake-audio-bytes',
    prefer_local=False,
    azure_configured=False,
    whisper_enabled=False,
    azure_result={},
    whisper_result={},
    expected_provider='none',
    expected_used_fallback=False,
    expected_error_contains='No speech recognition services available',
  ),
]


class _FakeAzureService:
  def __init__(self, *, configured: bool, result: dict[str, Any]):
    self._configured = configured
    self._result = result

  def is_configured(self) -> bool:
    return self._configured

  async def transcribe_audio_bytes(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
    return dict(self._result)


class _FakeWhisperService:
  def __init__(self, *, enabled: bool, result: dict[str, Any]):
    self._enabled = enabled
    self._result = result

  def is_enabled(self) -> bool:
    return self._enabled

  async def transcribe_audio_bytes(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
    return dict(self._result)


def _safe_settings_override(attribute: str, value: Any):
  original = getattr(settings, attribute)
  setattr(settings, attribute, value)

  class _Restore:
    def __enter__(self):
      return None

    def __exit__(self, exc_type, exc, tb):
      setattr(settings, attribute, original)
      return False

  return _Restore()


def _rank_of_expected_title(results: list[dict[str, Any]], expected_title: str) -> int | None:
  for index, item in enumerate(results, start=1):
    if str(item.get('title') or '') == expected_title:
      return index
  return None


def _mean_or_zero(values: list[float]) -> float:
  return round(mean(values), 4) if values else 0.0


def _mrr_from_ranks(ranks: list[int | None]) -> float:
  reciprocal_ranks = [1.0 / rank for rank in ranks if rank]
  return _mean_or_zero(reciprocal_ranks)


def _validate_pipeline_output(payload: Any) -> bool:
  if not hasattr(payload, 'model_dump'):
    return False

  data = payload.model_dump()
  required_fields = [
    'provider',
    'model',
    'confidence',
    'matching_score',
    'communication_score',
    'technical_depth_score',
    'recommendation',
    'summary',
    'buffer_statement',
    'structured_talking_points',
    'retrieved_cheatsheets',
    'prompt_version',
  ]
  if any(field not in data for field in required_fields):
    return False

  if data['provider'] != 'ai-interview-assistant':
    return False
  if data['recommendation'] not in {'pass', 'hold', 'reject'}:
    return False
  if not (0 <= int(data['confidence']) <= 100):
    return False
  if len(data['structured_talking_points']) != 3:
    return False
  if not data['buffer_statement']:
    return False
  if not data['summary']:
    return False
  if not isinstance(data['retrieved_cheatsheets'], list) or not data['retrieved_cheatsheets']:
    return False
  return True


async def run_pipeline_benchmark() -> dict[str, Any]:
  retriever = VectorCheatSheetRetriever()
  retriever.endpoint = ''

  original_key = settings.gemini_api_key
  settings.gemini_api_key = None
  try:
    case_records: list[dict[str, Any]] = []
    top1_hits = 0
    top3_hits = 0
    ranks: list[int | None] = []
    exact_repeat_matches = 0
    schema_valid_count = 0

    for case in PIPELINE_CASES:
      first = await infer_ai_interview_assistant(
        recruiter_question=case.recruiter_question,
        transcript_text=case.transcript_text,
        notes_text=case.notes_text,
        key_terms=case.key_terms,
      )
      second = await infer_ai_interview_assistant(
        recruiter_question=case.recruiter_question,
        transcript_text=case.transcript_text,
        notes_text=case.notes_text,
        key_terms=case.key_terms,
      )

      first_dump = first.model_dump()
      second_dump = second.model_dump()
      exact_repeat_matches += int(first_dump == second_dump)
      schema_valid_count += int(_validate_pipeline_output(first))

      retrieved_titles = [str(item.get('title') or '') for item in first_dump.get('retrieved_cheatsheets', [])]
      expected_rank = _rank_of_expected_title(first_dump.get('retrieved_cheatsheets', []), case.expected_top_title)
      ranks.append(expected_rank)
      top1_hits += int(expected_rank == 1)
      top3_hits += int(expected_rank is not None and expected_rank <= 3)

      case_records.append(
        {
          'name': case.name,
          'expected_top_title': case.expected_top_title,
          'retrieved_titles': retrieved_titles,
          'retrieval_rank': expected_rank,
          'exact_repeat_match': first_dump == second_dump,
          'confidence': first_dump.get('confidence'),
          'recommendation': first_dump.get('recommendation'),
          'summary': first_dump.get('summary'),
        }
      )

    total_cases = len(PIPELINE_CASES)
    return {
      'total_cases': total_cases,
      'top1_accuracy': round(top1_hits / total_cases, 4) if total_cases else 0.0,
      'top3_accuracy': round(top3_hits / total_cases, 4) if total_cases else 0.0,
      'mean_reciprocal_rank': _mrr_from_ranks(ranks),
      'schema_validity_rate': round(schema_valid_count / total_cases, 4) if total_cases else 0.0,
      'repeat_exact_match_rate': round(exact_repeat_matches / total_cases, 4) if total_cases else 0.0,
      'cases': case_records,
    }
  finally:
    settings.gemini_api_key = original_key


async def run_speech_routing_benchmark() -> dict[str, Any]:
  case_records: list[dict[str, Any]] = []
  matched = 0

  for case in SPEECH_ROUTING_CASES:
    service = object.__new__(UnifiedSpeechService)
    service.azure_service = _FakeAzureService(configured=case.azure_configured, result=case.azure_result)
    service.whisper_service = _FakeWhisperService(enabled=case.whisper_enabled, result=case.whisper_result)

    result: SpeechRecognitionResult = await service.transcribe(
      case.audio_data,
      language='zh-TW',
      prefer_local=case.prefer_local,
      filename='sample.webm',
      content_type='audio/webm',
    )

    payload = result.to_dict()
    expectation_met = (
      payload['provider'] == case.expected_provider
      and payload['used_fallback'] == case.expected_used_fallback
      and (case.expected_error_contains is None or case.expected_error_contains.lower() in (payload.get('error') or '').lower())
    )
    matched += int(expectation_met)

    case_records.append(
      {
        'name': case.name,
        'provider': payload['provider'],
        'used_fallback': payload['used_fallback'],
        'confidence': payload['confidence'],
        'text': payload['text'],
        'error': payload['error'],
        'expectation_met': expectation_met,
      }
    )

  total_cases = len(SPEECH_ROUTING_CASES)
  return {
    'total_cases': total_cases,
    'routing_accuracy': round(matched / total_cases, 4) if total_cases else 0.0,
    'cases': case_records,
  }


def run_text_validation_cases() -> dict[str, Any]:
  samples = [
    '  Hello   world  ',
    'a',
    '\n\tStructured   text with   gaps.  ',
  ]
  outputs = [validate_stt_text(sample) for sample in samples]
  return {
    'total_cases': len(samples),
    'non_empty_rate': round(sum(1 for item in outputs if item) / len(samples), 4),
    'cases': [{'input': sample, 'output': output} for sample, output in zip(samples, outputs, strict=True)],
  }


async def run_all_benchmarks() -> dict[str, Any]:
  pipeline = await run_pipeline_benchmark()
  speech = await run_speech_routing_benchmark()
  text_validation = run_text_validation_cases()

  generated_at = datetime.now(timezone.utc).isoformat()
  summary = {
    'generated_at': generated_at,
    'pipeline': pipeline,
    'speech_routing': speech,
    'text_validation': text_validation,
    'overall': {
      'benchmark_passed': pipeline['top1_accuracy'] >= 0.8 and pipeline['schema_validity_rate'] == 1.0 and speech['routing_accuracy'] == 1.0,
      'notes': 'All metrics are generated from deterministic local evaluation cases without external API calls.',
    },
  }
  return summary


def write_report(report: dict[str, Any], output_path: str | Path) -> Path:
  destination = Path(output_path)
  destination.parent.mkdir(parents=True, exist_ok=True)
  destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
  return destination


def render_markdown_summary(report: dict[str, Any]) -> str:
  pipeline = report['pipeline']
  speech = report['speech_routing']
  text_validation = report['text_validation']

  lines = [
    '# Interview Assistant Benchmark Summary',
    '',
    f"- Generated at: {report['generated_at']}",
    f"- Pipeline top-1 accuracy: {pipeline['top1_accuracy']:.2%}",
    f"- Pipeline top-3 accuracy: {pipeline['top3_accuracy']:.2%}",
    f"- Pipeline MRR: {pipeline['mean_reciprocal_rank']:.4f}",
    f"- Pipeline schema validity: {pipeline['schema_validity_rate']:.2%}",
    f"- Pipeline repeat exact match rate: {pipeline['repeat_exact_match_rate']:.2%}",
    f"- Speech routing accuracy: {speech['routing_accuracy']:.2%}",
    f"- STT text validation non-empty rate: {text_validation['non_empty_rate']:.2%}",
    '',
    '## Overall',
    f"- Benchmark passed: {report['overall']['benchmark_passed']}",
    f"- Notes: {report['overall']['notes']}",
  ]
  return '\n'.join(lines)


async def main_async(output_path: str | Path | None = None) -> dict[str, Any]:
  report = await run_all_benchmarks()
  destination = write_report(
    report,
    output_path or Path(__file__).resolve().parents[2] / 'evaluation_outputs' / 'interview_assistant_benchmark.json',
  )
  report['output_path'] = str(destination)
  destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
  return report


def main() -> None:
  report = asyncio.run(main_async())
  print(render_markdown_summary(report))


if __name__ == '__main__':
  main()