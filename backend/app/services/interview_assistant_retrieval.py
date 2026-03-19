from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

import httpx

from app.core.config import settings


@dataclass
class CheatSheetChunk:
  title: str
  content: str
  tags: list[str]
  score: float = 0.0


def _tokenize(text: str) -> list[str]:
  normalized = (text or '').lower()
  normalized = normalized.replace('vector db', 'vector_database')
  normalized = normalized.replace('rag', 'retrieval_augmented_generation')
  normalized = normalized.replace('mcp', 'model_context_protocol')
  return re.findall(r'[a-z0-9_\-]+', normalized)


class VectorCheatSheetRetriever:
  def __init__(self):
    self.top_k = max(1, settings.interview_assistant_top_k)
    self.endpoint = (settings.vector_store_endpoint or '').strip()
    self.api_key = (settings.vector_store_api_key or '').strip()
    self.timeout_seconds = max(2, settings.vector_store_timeout_seconds)
    self._local_chunks = self._build_local_cheatsheets()

  @staticmethod
  def _build_local_cheatsheets() -> list[CheatSheetChunk]:
    return [
      CheatSheetChunk(
        title='RAG System Design',
        content=(
          'Use retrieval-augmented generation with clear pipeline: query rewrite, vector retrieval, '
          'context grounding, and citation-aware response synthesis.'
        ),
        tags=['rag', 'llm', 'architecture', 'retrieval'],
      ),
      CheatSheetChunk(
        title='Model Context Protocol Integration',
        content=(
          'Explain MCP as a standardized tool interface enabling secure capability discovery, '
          'structured tool invocation, and policy-governed model actions.'
        ),
        tags=['mcp', 'integration', 'tooling', 'agent'],
      ),
      CheatSheetChunk(
        title='Vector DB Interview Talking Points',
        content=(
          'Cover embedding model selection, indexing strategy (HNSW/IVF), metadata filtering, '
          'latency-recall tradeoffs, and hybrid search with reranking.'
        ),
        tags=['vector db', 'embeddings', 'retrieval', 'performance'],
      ),
      CheatSheetChunk(
        title='System Reliability Under Load',
        content=(
          'Use async pipelines, bounded queues, graceful degradation, retry budget, and '
          'observability metrics: p95 latency, timeout rate, and token throughput.'
        ),
        tags=['asyncio', 'latency', 'reliability', 'performance'],
      ),
      CheatSheetChunk(
        title='Technical Communication Framework',
        content=(
          'Structure response in three steps: clarify scope, show technical approach with tradeoffs, '
          'and end with measurable outcomes and risk mitigation.'
        ),
        tags=['communication', 'interview', 'structure'],
      ),
    ]

  @staticmethod
  def _cosine_similarity(tokens_a: list[str], tokens_b: list[str]) -> float:
    if not tokens_a or not tokens_b:
      return 0.0

    a = Counter(tokens_a)
    b = Counter(tokens_b)
    common = set(a.keys()) & set(b.keys())

    numerator = float(sum(a[token] * b[token] for token in common))
    denominator = math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values()))
    if denominator == 0:
      return 0.0
    return numerator / denominator

  async def _search_remote(self, query: str) -> list[CheatSheetChunk] | None:
    if not self.endpoint:
      return None

    headers = {'Content-Type': 'application/json'}
    if self.api_key:
      headers['Authorization'] = f'Bearer {self.api_key}'

    try:
      async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
        response = await client.post(
          self.endpoint,
          headers=headers,
          json={
            'query': query,
            'topK': self.top_k,
            'namespace': 'interview-cheatsheets',
          },
        )
        response.raise_for_status()

      payload = response.json()
      matches = payload.get('matches') if isinstance(payload, dict) else []
      if not isinstance(matches, list):
        return None

      output: list[CheatSheetChunk] = []
      for item in matches[: self.top_k]:
        if not isinstance(item, dict):
          continue
        output.append(
          CheatSheetChunk(
            title=str(item.get('title') or 'CheatSheet'),
            content=str(item.get('content') or ''),
            tags=[str(v) for v in list(item.get('tags') or [])],
            score=float(item.get('score') or 0),
          )
        )
      return output
    except Exception:
      return None

  async def retrieve(self, *, query: str, transcript_text: str, notes_text: str) -> list[CheatSheetChunk]:
    remote_result = await self._search_remote(query)
    if remote_result:
      return remote_result

    search_text = ' '.join([query.strip(), transcript_text[-1800:], notes_text[-1200:]])
    query_tokens = _tokenize(search_text)
    if not query_tokens:
      return self._local_chunks[: self.top_k]

    ranked: list[CheatSheetChunk] = []
    for chunk in self._local_chunks:
      candidate_tokens = _tokenize(' '.join([chunk.title, chunk.content, ' '.join(chunk.tags)]))
      score = self._cosine_similarity(query_tokens, candidate_tokens)
      ranked.append(CheatSheetChunk(title=chunk.title, content=chunk.content, tags=chunk.tags, score=score))

    ranked.sort(key=lambda item: item.score, reverse=True)
    return ranked[: self.top_k]


_retriever: VectorCheatSheetRetriever | None = None


def get_cheatsheet_retriever() -> VectorCheatSheetRetriever:
  global _retriever
  if _retriever is None:
    _retriever = VectorCheatSheetRetriever()
  return _retriever
