from __future__ import annotations

import argparse
import itertools
import json
import logging
import os
import statistics
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

try:
  import azure.cognitiveservices.speech as speechsdk  # type: ignore[import-not-found]
except ModuleNotFoundError as error:
  raise SystemExit(
    'azure-cognitiveservices-speech is not installed. Run: pip install azure-cognitiveservices-speech'
  ) from error

LOGGER = logging.getLogger('azure_stt_benchmark')
DEFAULT_TERMS = ['RAG', 'MCP', 'Vector DB']


@dataclass
class BenchmarkCase:
  language: str
  profanity: str
  initial_silence_timeout_ms: int
  continuous: bool
  phrase_list_enabled: bool


@dataclass
class BenchmarkResult:
  case: BenchmarkCase
  recognized_text: str
  latency_ms: float
  no_match: bool
  cancellation_reason: str | None
  cancellation_error_code: str | None
  cancellation_error_details: str | None
  utterance_count: int
  word_error_rate: float | None


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Benchmark Azure Speech SDK settings for latency and recognition quality.')
  parser.add_argument('--audio-file', required=True, help='Path to a WAV/MP3 audio file.')
  parser.add_argument('--azure-key', default=os.getenv('AZURE_SPEECH_KEY'), help='Azure Speech key (or use AZURE_SPEECH_KEY).')
  parser.add_argument('--azure-region', default=os.getenv('AZURE_SPEECH_REGION'), help='Azure Speech region (or use AZURE_SPEECH_REGION).')
  parser.add_argument('--languages', default='en-US,zh-TW', help='Comma-separated languages to test.')
  parser.add_argument('--profanity-options', default='Masked,Raw', help='Comma-separated values: Masked, Raw, Removed.')
  parser.add_argument('--initial-silence-ms', default='1500,3000,5000', help='Comma-separated initial silence timeout values.')
  parser.add_argument('--reference-text', default='', help='Optional expected transcript text to compute word error rate.')
  parser.add_argument('--output-json', default='azure_stt_benchmark_report.json', help='Path for benchmark report JSON.')
  parser.add_argument('--custom-endpoint-id', default=os.getenv('AZURE_SPEECH_CUSTOM_ENDPOINT_ID', ''), help='Optional Custom Speech endpoint ID.')
  parser.add_argument('--phrase-terms', default=','.join(DEFAULT_TERMS), help='Comma-separated phrase list terms.')
  parser.add_argument('--log-level', default='INFO', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'])
  return parser.parse_args()


def configure_logging(level: str) -> None:
  logging.basicConfig(
    level=getattr(logging, level),
    format='%(asctime)s %(levelname)s %(name)s - %(message)s',
  )


def build_speech_config(
  *,
  key: str,
  region: str,
  language: str,
  profanity: str,
  initial_silence_timeout_ms: int,
  custom_endpoint_id: str,
) -> speechsdk.SpeechConfig:
  speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
  speech_config.speech_recognition_language = language
  speech_config.output_format = speechsdk.OutputFormat.Detailed

  profanity_map = {
    'masked': speechsdk.ProfanityOption.Masked,
    'raw': speechsdk.ProfanityOption.Raw,
    'removed': speechsdk.ProfanityOption.Removed,
  }
  profanity_option = profanity_map.get(profanity.strip().lower())
  if profanity_option is None:
    raise ValueError(f'Unsupported profanity option: {profanity}')

  speech_config.set_profanity(profanity_option)
  speech_config.set_property(
    speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
    str(initial_silence_timeout_ms),
  )
  speech_config.set_property(
    speechsdk.PropertyId.SpeechServiceResponse_RequestWordLevelTimestamps,
    'true',
  )

  if custom_endpoint_id:
    speech_config.endpoint_id = custom_endpoint_id

  return speech_config


def attach_phrase_list(recognizer: speechsdk.SpeechRecognizer, terms: list[str], enabled: bool) -> None:
  if not enabled or not terms:
    return

  phrase_list = speechsdk.PhraseListGrammar.from_recognizer(recognizer)
  for term in terms:
    stripped = term.strip()
    if stripped:
      phrase_list.addPhrase(stripped)


def word_error_rate(reference_text: str, hypothesis_text: str) -> float | None:
  reference = reference_text.strip().lower().split()
  hypothesis = hypothesis_text.strip().lower().split()
  if not reference:
    return None

  rows = len(reference) + 1
  cols = len(hypothesis) + 1
  dp: list[list[int]] = [[0] * cols for _ in range(rows)]

  for row in range(rows):
    dp[row][0] = row
  for col in range(cols):
    dp[0][col] = col

  for row in range(1, rows):
    for col in range(1, cols):
      if reference[row - 1] == hypothesis[col - 1]:
        dp[row][col] = dp[row - 1][col - 1]
      else:
        dp[row][col] = min(
          dp[row - 1][col] + 1,
          dp[row][col - 1] + 1,
          dp[row - 1][col - 1] + 1,
        )

  return dp[-1][-1] / max(1, len(reference))


def recognize_single(
  *,
  speech_config: speechsdk.SpeechConfig,
  language: str,
  profanity: str,
  initial_silence_timeout_ms: int,
  audio_file: str,
  phrase_terms: list[str],
  phrase_list_enabled: bool,
  reference_text: str,
) -> BenchmarkResult:
  audio_config = speechsdk.audio.AudioConfig(filename=audio_file)
  recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
  attach_phrase_list(recognizer, phrase_terms, phrase_list_enabled)

  start = time.perf_counter()
  result = recognizer.recognize_once()
  latency_ms = (time.perf_counter() - start) * 1000

  no_match = result.reason == speechsdk.ResultReason.NoMatch
  recognized_text = result.text if result.reason == speechsdk.ResultReason.RecognizedSpeech else ''

  cancellation_reason = None
  cancellation_error_code = None
  cancellation_error_details = None

  if result.reason == speechsdk.ResultReason.Canceled:
    details = speechsdk.CancellationDetails(result)
    cancellation_reason = str(details.reason)
    cancellation_error_code = str(details.error_code)
    cancellation_error_details = details.error_details
    LOGGER.error('Single utterance canceled: reason=%s code=%s details=%s', cancellation_reason, cancellation_error_code, cancellation_error_details)

  if no_match:
    details = speechsdk.NoMatchDetails.from_result(result)
    LOGGER.warning('Single utterance no match: %s', details.reason)

  return BenchmarkResult(
    case=BenchmarkCase(
      language=language,
      profanity=profanity,
      initial_silence_timeout_ms=initial_silence_timeout_ms,
      continuous=False,
      phrase_list_enabled=phrase_list_enabled,
    ),
    recognized_text=recognized_text,
    latency_ms=latency_ms,
    no_match=no_match,
    cancellation_reason=cancellation_reason,
    cancellation_error_code=cancellation_error_code,
    cancellation_error_details=cancellation_error_details,
    utterance_count=1 if recognized_text else 0,
    word_error_rate=word_error_rate(reference_text, recognized_text) if reference_text else None,
  )


def recognize_continuous(
  *,
  speech_config: speechsdk.SpeechConfig,
  language: str,
  profanity: str,
  initial_silence_timeout_ms: int,
  audio_file: str,
  phrase_terms: list[str],
  phrase_list_enabled: bool,
  reference_text: str,
) -> BenchmarkResult:
  audio_config = speechsdk.audio.AudioConfig(filename=audio_file)
  recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
  attach_phrase_list(recognizer, phrase_terms, phrase_list_enabled)

  done = {'value': False}
  recognized_segments: list[str] = []
  cancellation_reason = None
  cancellation_error_code = None
  cancellation_error_details = None
  no_match = False

  def on_recognized(event: speechsdk.SpeechRecognitionEventArgs) -> None:
    if event.result.reason == speechsdk.ResultReason.RecognizedSpeech and event.result.text:
      recognized_segments.append(event.result.text)
    elif event.result.reason == speechsdk.ResultReason.NoMatch:
      nonlocal no_match
      no_match = True
      details = speechsdk.NoMatchDetails.from_result(event.result)
      LOGGER.warning('Continuous no match: %s', details.reason)

  def on_canceled(event: speechsdk.SpeechRecognitionCanceledEventArgs) -> None:
    nonlocal cancellation_reason, cancellation_error_code, cancellation_error_details
    cancellation_reason = str(event.reason)
    cancellation_error_code = str(event.error_code)
    cancellation_error_details = event.error_details
    LOGGER.error('Continuous canceled: reason=%s code=%s details=%s', cancellation_reason, cancellation_error_code, cancellation_error_details)
    done['value'] = True

  def on_session_stopped(_: speechsdk.SessionEventArgs) -> None:
    done['value'] = True

  recognizer.recognized.connect(on_recognized)
  recognizer.canceled.connect(on_canceled)
  recognizer.session_stopped.connect(on_session_stopped)

  start = time.perf_counter()
  recognizer.start_continuous_recognition()

  timeout_seconds = 90
  while not done['value'] and (time.perf_counter() - start) < timeout_seconds:
    time.sleep(0.1)

  recognizer.stop_continuous_recognition()
  latency_ms = (time.perf_counter() - start) * 1000

  recognized_text = ' '.join(segment.strip() for segment in recognized_segments if segment.strip())

  return BenchmarkResult(
    case=BenchmarkCase(
      language=language,
      profanity=profanity,
      initial_silence_timeout_ms=initial_silence_timeout_ms,
      continuous=True,
      phrase_list_enabled=phrase_list_enabled,
    ),
    recognized_text=recognized_text,
    latency_ms=latency_ms,
    no_match=no_match,
    cancellation_reason=cancellation_reason,
    cancellation_error_code=cancellation_error_code,
    cancellation_error_details=cancellation_error_details,
    utterance_count=len(recognized_segments),
    word_error_rate=word_error_rate(reference_text, recognized_text) if reference_text else None,
  )


def run_benchmark(args: argparse.Namespace) -> list[BenchmarkResult]:
  if not args.azure_key or not args.azure_region:
    raise SystemExit('Azure credentials missing. Provide --azure-key and --azure-region or set env vars.')

  audio_path = Path(args.audio_file)
  if not audio_path.exists():
    raise SystemExit(f'Audio file not found: {audio_path}')

  languages = [value.strip() for value in args.languages.split(',') if value.strip()]
  profanities = [value.strip() for value in args.profanity_options.split(',') if value.strip()]
  silence_values = [int(value.strip()) for value in args.initial_silence_ms.split(',') if value.strip()]
  phrase_terms = [value.strip() for value in args.phrase_terms.split(',') if value.strip()]

  results: list[BenchmarkResult] = []

  for language, profanity, silence_ms in itertools.product(languages, profanities, silence_values):
    LOGGER.info('Testing language=%s profanity=%s initial_silence=%sms', language, profanity, silence_ms)

    for phrase_list_enabled in [False, True]:
      speech_config = build_speech_config(
        key=args.azure_key,
        region=args.azure_region,
        language=language,
        profanity=profanity,
        initial_silence_timeout_ms=silence_ms,
        custom_endpoint_id=args.custom_endpoint_id,
      )

      single_result = recognize_single(
        speech_config=speech_config,
        language=language,
        profanity=profanity,
        initial_silence_timeout_ms=silence_ms,
        audio_file=str(audio_path),
        phrase_terms=phrase_terms,
        phrase_list_enabled=phrase_list_enabled,
        reference_text=args.reference_text,
      )
      results.append(single_result)

      continuous_result = recognize_continuous(
        speech_config=speech_config,
        language=language,
        profanity=profanity,
        initial_silence_timeout_ms=silence_ms,
        audio_file=str(audio_path),
        phrase_terms=phrase_terms,
        phrase_list_enabled=phrase_list_enabled,
        reference_text=args.reference_text,
      )
      results.append(continuous_result)

  return results


def summarize(results: list[BenchmarkResult]) -> dict[str, Any]:
  if not results:
    return {'count': 0}

  latencies = [item.latency_ms for item in results]
  wer_values = [item.word_error_rate for item in results if item.word_error_rate is not None]
  cancellations = [item for item in results if item.cancellation_reason]
  no_match_count = sum(1 for item in results if item.no_match)
  accuracy_candidates = [item for item in results if item.word_error_rate is not None]
  best_accuracy_source = min(accuracy_candidates, key=lambda item: float(item.word_error_rate or 1.0)) if accuracy_candidates else results[0]

  return {
    'count': len(results),
    'latency_ms_avg': round(statistics.mean(latencies), 2),
    'latency_ms_p95': round(statistics.quantiles(latencies, n=20)[-1], 2) if len(latencies) >= 20 else round(max(latencies), 2),
    'word_error_rate_avg': round(statistics.mean(wer_values), 4) if wer_values else None,
    'cancellation_count': len(cancellations),
    'no_match_count': no_match_count,
    'best_latency_case': asdict(min(results, key=lambda item: item.latency_ms).case),
    'best_accuracy_case': asdict(best_accuracy_source.case),
  }


def result_to_json(item: BenchmarkResult) -> dict[str, Any]:
  payload = asdict(item)
  payload['latency_ms'] = round(item.latency_ms, 2)
  return payload


def main() -> None:
  args = parse_args()
  configure_logging(args.log_level)

  results = run_benchmark(args)
  report = {
    'summary': summarize(results),
    'results': [result_to_json(item) for item in results],
    'recommendations': {
      'phrase_list': 'Enable phrase list if technical terms are missing (RAG, MCP, Vector DB).',
      'custom_speech': 'If repeated domain vocabulary errors persist, train Custom Speech and pass --custom-endpoint-id.',
      'mode_selection': 'Use continuous recognition for long interview answers; use single utterance for short Q&A turns.',
    },
  }

  output_path = Path(args.output_json)
  output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

  print('=== Azure STT Benchmark Summary ===')
  print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
  print(f'\nReport saved to: {output_path.resolve()}')


if __name__ == '__main__':
  main()
