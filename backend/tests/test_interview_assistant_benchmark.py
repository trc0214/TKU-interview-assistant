from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = BACKEND_ROOT / 'scripts' / 'benchmark_interview_assistant.py'


def _load_module():
  spec = importlib.util.spec_from_file_location('interview_assistant_benchmark', MODULE_PATH)
  if spec is None or spec.loader is None:
    raise RuntimeError('Unable to load benchmark module')
  module = importlib.util.module_from_spec(spec)
  sys.modules[spec.name] = module
  spec.loader.exec_module(module)
  return module


class InterviewAssistantBenchmarkTests(unittest.IsolatedAsyncioTestCase):
  async def asyncSetUp(self):
    self.module = _load_module()

  async def test_pipeline_metrics_are_strong(self):
    report = await self.module.benchmark_retrieval()

    self.assertGreaterEqual(report['summary']['top1_accuracy'], 0.8)
    self.assertGreaterEqual(report['summary']['top3_recall'], 0.8)
    self.assertGreater(report['summary']['avg_latency_ms'], 0)

    for case in report['cases']:
      self.assertTrue(case['top1_match'])
      self.assertEqual(case['expected_title'], case['top_titles'][0])

  async def test_generation_metrics_are_valid_and_deterministic(self):
    report = await self.module.benchmark_generation()

    self.assertEqual(report['summary']['valid_payload_rate'], 1.0)
    self.assertEqual(report['summary']['deterministic_rate'], 1.0)
    for case in report['cases']:
      self.assertTrue(case['valid_payload'])
      self.assertTrue(case['deterministic_repeat'])
      self.assertIn(case['recommendation'], {'pass', 'hold', 'reject'})
      self.assertEqual(case['follow_up_questions_count'], 2)

  async def test_pipeline_outputs_are_bounded(self):
    report = await self.module.benchmark_pipeline()

    self.assertEqual(report['summary']['valid_output_rate'], 1.0)
    for case in report['cases']:
      self.assertTrue(case['valid_output'])
      self.assertGreaterEqual(case['confidence'], 0)
      self.assertLessEqual(case['confidence'], 100)
      self.assertEqual(case['structured_talking_points_count'], 3)

  async def test_speech_routing_is_correct(self):
    report = await self.module.benchmark_speech_routing()

    self.assertEqual(report['summary']['correct_rate'], 1.0)
    for case in report['cases']:
      self.assertTrue(case['correct'])

  async def test_benchmark_artifacts_are_written(self):
    report = await self.module.run_benchmark()
    json_path = BACKEND_ROOT / 'artifacts' / 'interview_assistant_benchmark_report.json'
    md_path = BACKEND_ROOT / 'artifacts' / 'interview_assistant_benchmark_report.md'

    self.assertTrue(json_path.exists())
    self.assertTrue(md_path.exists())
    self.assertIn('retrieval', report['sections'])
    self.assertIn('generation', report['sections'])
    self.assertIn('pipeline', report['sections'])
    self.assertIn('speech_routing', report['sections'])


if __name__ == '__main__':
  unittest.main()