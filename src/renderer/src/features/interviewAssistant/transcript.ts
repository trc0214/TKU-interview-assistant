export type TranscriptEntry = {
  id: string
  text: string
  createdAt: number
  terms: string[]
}

const MAX_REPEATED_CHARACTER_RUN = 3
const MAX_ENTRY_TEXT_LENGTH = 600

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

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function squashRepeatedCharacters(text: string): string {
  if (!text) return text

  let output = ''
  let previousChar = ''
  let runLength = 0

  for (const char of text) {
    if (char === previousChar) {
      runLength += 1
    } else {
      previousChar = char
      runLength = 1
    }

    if (runLength <= MAX_REPEATED_CHARACTER_RUN) {
      output += char
    }
  }

  return output
}

function collapseRepeatedPhrase(text: string): string {
  let output = text
  output = output.replace(/(.{1,20}?)(\1){2,}/g, '$1$1')
  output = output.replace(/\b(\S{1,20})(\s+\1){2,}\b/gi, '$1 $1')
  return output
}

export function sanitizeTranscriptText(text: string): string {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return ''

  const compacted = collapseRepeatedPhrase(squashRepeatedCharacters(normalized))
  const withoutArtifacts = compacted
    .replace(/[|¦]+/g, ' ')
    .replace(/[\uFFFD]+/g, '')
    .trim()

  if (!withoutArtifacts) return ''
  if (/^(.)\1{4,}$/.test(withoutArtifacts)) return ''

  return withoutArtifacts.slice(0, MAX_ENTRY_TEXT_LENGTH)
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
  const sanitizedText = sanitizeTranscriptText(text)
  return {
    id: `entry-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    text: sanitizedText,
    createdAt: timestamp,
    terms: detectTechnicalTerms(sanitizedText)
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
  try {
    const validEntries = entries
      .map((entry) => ({
        ...entry,
        text: sanitizeTranscriptText(entry.text),
      }))
      .filter((entry) => Boolean(entry.text))

    if (!validEntries.length) {
      return '# Interview Notes\n\nNo transcript captured yet.'
    }

    const topTerms = collectTopTerms(validEntries)
    const highlights = validEntries.slice(-8).map((entry) => `- ${entry.text}`)

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
  } catch {
    return '# Interview Notes\n\nFailed to generate structured notes from transcript. Please review transcript entries manually.'
  }
}
