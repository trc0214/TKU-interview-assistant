import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clearDraft, loadDraft, saveDraft } from './storage'
import {
  buildInterviewNotes,
  buildTranscriptEntry,
  collectTopTerms,
  type TranscriptEntry
} from './transcript'

type SpeechRecognitionAlternativeLike = {
  transcript: string
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: SpeechRecognitionResultLike[]
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function resolveSpeechRecognition(): SpeechRecognitionConstructor | null {
  const maybeWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }

  return maybeWindow.SpeechRecognition ?? maybeWindow.webkitSpeechRecognition ?? null
}

type InitParams = {
  interviewId?: number
  interviewer?: string
  candidateName?: string
}

export type InterviewAssistantSnapshot = {
  startedAt: number | null
  transcriptEntries: TranscriptEntry[]
  partialText: string
  notes: string
  updatedAt?: number
}

type InterviewAssistantApi = {
  isSupported: boolean
  isListening: boolean
  isOnline: boolean
  error: string | null
  notes: string
  partialText: string
  transcriptEntries: TranscriptEntry[]
  transcriptText: string
  keyTerms: string[]
  startedAt: number | null
  updatedAt: number
  hasSessionContent: boolean
  setNotes: (value: string) => void
  persistDraft: () => void
  startListening: () => void
  stopListening: () => void
  resetSession: (shouldClearDraft: boolean) => void
  restoreDraft: () => boolean
  restoreSnapshot: (snapshot: InterviewAssistantSnapshot) => void
  regenerateNotes: () => string
}

export function useInterviewAssistant({
  interviewId,
  interviewer,
  candidateName
}: InitParams): InterviewAssistantApi {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const autoSaveIdRef = useRef<number | null>(null)

  const [isSupported] = useState(() => !!resolveSpeechRecognition())
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partialText, setPartialText] = useState('')
  const [notes, setNotes] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine)
  const [updatedAt, setUpdatedAt] = useState(() => Date.now())

  const setNotesValue = useCallback((value: string) => {
    setNotes(value)
    setUpdatedAt(Date.now())
  }, [])

  useEffect(() => {
    const onOnline = (): void => setIsOnline(true)
    const onOffline = (): void => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const persistDraft = useCallback(() => {
    saveDraft({
      interviewId,
      startedAt,
      transcriptEntries,
      partialText,
      notes,
      updatedAt: Date.now()
    })
  }, [interviewId, notes, partialText, startedAt, transcriptEntries])

  useEffect(() => {
    if (autoSaveIdRef.current) {
      window.clearInterval(autoSaveIdRef.current)
    }

    autoSaveIdRef.current = window.setInterval(() => {
      persistDraft()
    }, 4000)

    return () => {
      if (autoSaveIdRef.current) {
        window.clearInterval(autoSaveIdRef.current)
        autoSaveIdRef.current = null
      }
      persistDraft()
    }
  }, [persistDraft])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('This browser runtime does not support SpeechRecognition.')
      return
    }

    if (isListening) return

    try {
      setError(null)
      if (!startedAt) {
        setStartedAt(Date.now())
      }

      const Recognition = resolveSpeechRecognition()
      if (!Recognition) {
        setError('SpeechRecognition is unavailable.')
        return
      }

      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'zh-TW'

      recognition.onresult = (event) => {
        let nextPartial = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const text = result?.[0]?.transcript?.trim() ?? ''
          if (!text) continue

          if (result.isFinal) {
            setTranscriptEntries((previous) => [...previous, buildTranscriptEntry(text)])
            setUpdatedAt(Date.now())
            nextPartial = ''
          } else {
            nextPartial = text
          }
        }
        setPartialText(nextPartial)
      }

      recognition.onerror = (event) => {
        setError(
          event?.error ? `Speech recognition error: ${event.error}` : 'Speech recognition failed.'
        )
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    } catch (unknownError) {
      const message =
        unknownError instanceof Error ? unknownError.message : 'Unable to start recognition.'
      setError(message)
      setIsListening(false)
    }
  }, [isListening, isSupported, startedAt])

  const resetSession = useCallback(
    (shouldClearDraft: boolean) => {
      stopListening()
      setPartialText('')
      setTranscriptEntries([])
      setStartedAt(null)
      setUpdatedAt(Date.now())
      if (shouldClearDraft) {
        clearDraft(interviewId)
      }
      setNotes('')
    },
    [interviewId, stopListening]
  )

  const restoreDraft = useCallback(() => {
    const draft = loadDraft(interviewId)
    if (!draft) return false

    setStartedAt(draft.startedAt)
    setTranscriptEntries(draft.transcriptEntries)
    setPartialText(draft.partialText)
    setNotes(draft.notes)
    setUpdatedAt(draft.updatedAt || Date.now())
    return true
  }, [interviewId])

  const restoreSnapshot = useCallback((snapshot: InterviewAssistantSnapshot) => {
    setStartedAt(snapshot.startedAt)
    setTranscriptEntries(snapshot.transcriptEntries)
    setPartialText(snapshot.partialText)
    setNotes(snapshot.notes)
    setUpdatedAt(snapshot.updatedAt || Date.now())
  }, [])

  const regenerateNotes = useCallback(() => {
    const generated = buildInterviewNotes(transcriptEntries, interviewer, candidateName)
    setNotes(generated)
    setUpdatedAt(Date.now())
    return generated
  }, [candidateName, interviewer, transcriptEntries])

  const transcriptText = useMemo(
    () => transcriptEntries.map((entry) => entry.text).join('\n\n'),
    [transcriptEntries]
  )
  const keyTerms = useMemo(() => collectTopTerms(transcriptEntries), [transcriptEntries])
  const hasSessionContent = useMemo(
    () => Boolean(notes.trim() || partialText.trim() || transcriptEntries.length),
    [notes, partialText, transcriptEntries]
  )

  return {
    isSupported,
    isListening,
    isOnline,
    error,
    notes,
    partialText,
    transcriptEntries,
    transcriptText,
    keyTerms,
    startedAt,
    updatedAt,
    hasSessionContent,
    setNotes: setNotesValue,
    persistDraft,
    startListening,
    stopListening,
    resetSession,
    restoreDraft,
    restoreSnapshot,
    regenerateNotes
  }
}
