export type TranscriptEntry = {
  id: string
  text: string
  createdAt: number
  terms: string[]
}

const TECHNICAL_TERMS = [
  'API',
  'SDK',
  'HTTP',
  'HTTPS',
  'TCP',
  'UDP',
  'SQL',
  'NoSQL',
  'RAG',
  'LLM',
  'Cache',
  'Concurrency',
  'Thread',
  'Process',
  'Docker',
  'Kubernetes',
  'CI/CD',
  'System Design',
  'Data Structure',
  'Algorithm'
]

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

export function detectTechnicalTerms(text: string): string[] {
  if (!text.trim()) return []

  const terms: string[] = []
  const uppercaseTerms = text.match(/\b[A-Z][A-Z0-9-]{1,}\b/g) || []
  terms.push(...uppercaseTerms)

  for (const term of TECHNICAL_TERMS) {
    const expression = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    if (expression.test(text)) {
      terms.push(term)
    }
  }

  return uniqueSorted(terms)
}

export function buildTranscriptEntry(text: string, timestamp = Date.now()): TranscriptEntry {
  return {
    id: `entry-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    createdAt: timestamp,
    terms: detectTechnicalTerms(text)
  }
}

export function collectTopTerms(entries: TranscriptEntry[], maxItems = 12): string[] {
  const scores = new Map<string, number>()
  entries.forEach((entry) => {
    entry.terms.forEach((term) => {
      const normalized = normalizeToken(term)
      if (!normalized) return
      scores.set(term, (scores.get(term) ?? 0) + 1)
    })
  })

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxItems)
    .map(([term]) => term)
}

export function buildInterviewNotes(
  entries: TranscriptEntry[],
  interviewer = '',
  candidate = ''
): string {
  if (!entries.length) {
    return '# Interview Notes\n\nNo transcript captured yet.'
  }

  const topTerms = collectTopTerms(entries)
  const highlights = entries.slice(-8).map((entry) => `- ${entry.text}`)

  const header = [
    '# Interview Notes',
    '',
    `- Interviewer: ${interviewer || 'N/A'}`,
    `- Candidate: ${candidate || 'N/A'}`,
    `- Updated At: ${new Date().toLocaleString()}`,
    ''
  ]

  const termsSection = [
    '## Detected Key Terms',
    topTerms.length ? topTerms.map((term) => `- ${term}`).join('\n') : '- None',
    ''
  ]

  const highlightsSection = ['## Transcript Highlights', ...highlights, '']

  return [...header, ...termsSection, ...highlightsSection].join('\n')
}
