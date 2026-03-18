import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { request } from '../../api/http'
import { clearDraft, loadDraft, saveDraft } from './storage'
import {
  buildInterviewNotes,
  buildTranscriptEntry,
  collectTopTerms,
  type TranscriptEntry
} from './transcript'

const AUDIO_QUALITY_POLL_MS = 180
const RECORDER_TIMESLICE_MS = 2000
const SILENCE_RELEASE_MS = 650
const MIN_CHUNK_BYTES = 8192
const MIN_BATCH_UPLOAD_BYTES = 22000
const SPEECH_RMS_THRESHOLD = 0.012
const NOISE_RMS_THRESHOLD = 0.018
const LOW_VOLUME_RMS_THRESHOLD = 0.01
const MIN_TRANSCRIPT_TEXT_LENGTH = 2
const MERGE_WINDOW_MS = 8000
const SHORT_FRAGMENT_LENGTH = 18

type AudioIssue = 'low-volume' | 'high-noise' | 'clipping' | null

type SpeechTranscribeResponse = {
  text: string
  language: string
  confidence: number
  provider: string
  used_fallback: boolean
  error?: string | null
}

function supportsBackendTranscription(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined',
  )
}

function resolveRecorderMimeType(): string | undefined {
  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]

  for (const mimeType of preferredTypes) {
    if (window.MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  return undefined
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
  recognitionProvider: string
  recognitionUsedFallback: boolean
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
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const analysisTimerRef = useRef<number | null>(null)
  const isStoppingRef = useRef(false)
  const activeSessionRef = useRef(0)
  const initializationChunkRef = useRef<Blob | null>(null)
  const preRollChunkRef = useRef<Blob | null>(null)
  const carryOverChunkRef = useRef<Blob | null>(null)
  const pendingSpeechChunksRef = useRef<Blob[]>([])
  const pendingSpeechBytesRef = useRef(0)
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve())
  const noSpeechChunkCountRef = useRef(0)
  const speechLikelyRef = useRef(false)
  const recentSpeechMsRef = useRef(0)
  const lowVolumeMsRef = useRef(0)
  const highNoiseMsRef = useRef(0)
  const clippingMsRef = useRef(0)
  const lastAudioIssueRef = useRef<AudioIssue>(null)
  const autoSaveIdRef = useRef<number | null>(null)

  const [isSupported] = useState(() => supportsBackendTranscription())
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recognitionProvider, setRecognitionProvider] = useState('backend')
  const [recognitionUsedFallback, setRecognitionUsedFallback] = useState(false)
  const [partialText, setPartialText] = useState('')
  const [notes, setNotes] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine)
  const [updatedAt, setUpdatedAt] = useState(() => Date.now())

  const computeRmsAndPeak = (timeDomain: Uint8Array): { rms: number; peak: number } => {
    if (!timeDomain.length) {
      return { rms: 0, peak: 0 }
    }

    let sum = 0
    let peak = 0
    for (let index = 0; index < timeDomain.length; index += 1) {
      const normalized = (timeDomain[index] - 128) / 128
      const absolute = Math.abs(normalized)
      sum += normalized * normalized
      if (absolute > peak) {
        peak = absolute
      }
    }

    return {
      rms: Math.sqrt(sum / timeDomain.length),
      peak,
    }
  }

  const resolveIssueMessage = (issue: AudioIssue): string | null => {
    if (issue === 'low-volume') {
      return '目前音量偏低，請靠近麥克風。'
    }
    if (issue === 'high-noise') {
      return '背景噪音偏高，請先降低環境噪音。'
    }
    if (issue === 'clipping') {
      return '輸入音量過高造成失真，請稍微遠離麥克風。'
    }
    return null
  }

  const stopAudioAnalysis = useCallback(() => {
    if (analysisTimerRef.current) {
      window.clearInterval(analysisTimerRef.current)
      analysisTimerRef.current = null
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {
        // ignore context close failures
      })
      audioContextRef.current = null
    }

    analyserRef.current = null
    speechLikelyRef.current = false
    recentSpeechMsRef.current = 0
    lowVolumeMsRef.current = 0
    highNoiseMsRef.current = 0
    clippingMsRef.current = 0
    lastAudioIssueRef.current = null
  }, [])

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      return
    }

    try {
      const context = new AudioContextCtor()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.65
      source.connect(analyser)

      audioContextRef.current = context
      analyserRef.current = analyser

      const bucket = new Uint8Array(analyser.frequencyBinCount)
      analysisTimerRef.current = window.setInterval(() => {
        if (!analyserRef.current) {
          return
        }

        analyserRef.current.getByteTimeDomainData(bucket)
        const { rms, peak } = computeRmsAndPeak(bucket)
        const hasSpeech = rms >= SPEECH_RMS_THRESHOLD || (peak >= 0.08 && rms >= LOW_VOLUME_RMS_THRESHOLD * 1.5)
        speechLikelyRef.current = hasSpeech

        if (hasSpeech) {
          recentSpeechMsRef.current = SILENCE_RELEASE_MS
          lowVolumeMsRef.current = 0
          highNoiseMsRef.current = 0
          clippingMsRef.current = 0
          if (lastAudioIssueRef.current) {
            lastAudioIssueRef.current = null
            setError((current) => (current && current.includes('麥克風') ? null : current))
          }
          return
        }

        recentSpeechMsRef.current = Math.max(0, recentSpeechMsRef.current - AUDIO_QUALITY_POLL_MS)
        lowVolumeMsRef.current = rms < LOW_VOLUME_RMS_THRESHOLD ? lowVolumeMsRef.current + AUDIO_QUALITY_POLL_MS : Math.max(0, lowVolumeMsRef.current - AUDIO_QUALITY_POLL_MS)
        highNoiseMsRef.current = rms > NOISE_RMS_THRESHOLD ? highNoiseMsRef.current + AUDIO_QUALITY_POLL_MS : Math.max(0, highNoiseMsRef.current - AUDIO_QUALITY_POLL_MS)
        clippingMsRef.current = peak > 0.98 ? clippingMsRef.current + AUDIO_QUALITY_POLL_MS : Math.max(0, clippingMsRef.current - AUDIO_QUALITY_POLL_MS)

        let issue: AudioIssue = null
        if (clippingMsRef.current >= 360) {
          issue = 'clipping'
        } else if (highNoiseMsRef.current >= 1200) {
          issue = 'high-noise'
        } else if (lowVolumeMsRef.current >= 1500) {
          issue = 'low-volume'
        }

        if (issue !== lastAudioIssueRef.current) {
          lastAudioIssueRef.current = issue
          const message = resolveIssueMessage(issue)
          if (message) {
            setError(message)
          }
        }
      }, AUDIO_QUALITY_POLL_MS)
    } catch {
      // analysis is best-effort only
    }
  }, [])

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
    const recorder = recorderRef.current
    isStoppingRef.current = true

    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.requestData()
      } catch {
        // ignore requestData failures on some runtimes
      }
      recorder.stop()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    stopAudioAnalysis()

    recorderRef.current = null
    initializationChunkRef.current = null
    preRollChunkRef.current = null
    carryOverChunkRef.current = null
    pendingSpeechChunksRef.current = []
    pendingSpeechBytesRef.current = 0
    uploadQueueRef.current = Promise.resolve()
    noSpeechChunkCountRef.current = 0
    setIsListening(false)
    setPartialText('')
  }, [stopAudioAnalysis])

  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError('目前環境不支援錄音（MediaRecorder/getUserMedia 不可用）。')
      return
    }

    if (isListening) return

    try {
      setError(null)
      setRecognitionProvider('backend')
      setRecognitionUsedFallback(false)
      if (!startedAt) {
        setStartedAt(Date.now())
      }

      const sessionId = Date.now()
      activeSessionRef.current = sessionId
      isStoppingRef.current = false

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      startAudioAnalysis(stream)

      const mimeType = resolveRecorderMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      initializationChunkRef.current = null
      carryOverChunkRef.current = null
      pendingSpeechChunksRef.current = []
      pendingSpeechBytesRef.current = 0

      const isLikelyWebm = (mimeType || '').includes('webm')
      const isLikelyMp4 = (mimeType || '').includes('mp4')

      const normalizeChunk = (chunk: Blob): Blob => {
        if (!chunk.size) return chunk

        if (!isLikelyWebm && !isLikelyMp4) {
          return chunk
        }

        if (!initializationChunkRef.current) {
          initializationChunkRef.current = chunk
          return chunk
        }

        return new Blob([initializationChunkRef.current, chunk], {
          type: chunk.type || mimeType || 'audio/webm',
        })
      }

      const appendTranscriptText = (incomingText: string) => {
        const text = incomingText.trim()
        if (text.length < MIN_TRANSCRIPT_TEXT_LENGTH) {
          return
        }

        setTranscriptEntries((previous) => {
          const last = previous[previous.length - 1]
          if (!last) {
            return [...previous, buildTranscriptEntry(text)]
          }

          const isDuplicate =
            text === last.text ||
            last.text.includes(text) ||
            (text.includes(last.text) && text.length - last.text.length <= 10)

          if (isDuplicate) {
            if (text.length > last.text.length) {
              return [...previous.slice(0, -1), buildTranscriptEntry(text, last.createdAt)]
            }
            return previous
          }

          const shouldMerge =
            Date.now() - last.createdAt <= MERGE_WINDOW_MS &&
            (text.length <= SHORT_FRAGMENT_LENGTH || !/[。！？.!?]$/.test(last.text))

          if (shouldMerge) {
            const separator = /^[，。！？,.!?]/.test(text) ? '' : ' '
            const mergedText = `${last.text}${separator}${text}`.trim()
            return [...previous.slice(0, -1), buildTranscriptEntry(mergedText, last.createdAt)]
          }

          return [...previous, buildTranscriptEntry(text)]
        })

        setUpdatedAt(Date.now())
      }

      const flushPendingChunks = async () => {
        const pendingChunks = pendingSpeechChunksRef.current
        if (!pendingChunks.length) {
          return
        }

        const extension = mimeType?.includes('mp4') ? 'mp4' : mimeType?.includes('ogg') ? 'ogg' : 'webm'
        const leadingChunk = carryOverChunkRef.current
        const payloadBlob = new Blob(
          leadingChunk ? [leadingChunk, ...pendingChunks] : pendingChunks,
          {
            type: pendingChunks[pendingChunks.length - 1]?.type || mimeType || 'audio/webm',
          },
        )

        pendingSpeechChunksRef.current = []
        pendingSpeechBytesRef.current = 0
        carryOverChunkRef.current = pendingChunks[pendingChunks.length - 1] || null

        try {
          setPartialText('辨識中…')

          const file = new File([payloadBlob], `chunk-${Date.now()}.${extension}`, {
            type: payloadBlob.type || mimeType || 'audio/webm',
          })
          const formData = new FormData()
          formData.append('file', file)

          const response = await request<SpeechTranscribeResponse>(
            '/speech/transcribe?language=zh-TW&prefer_local=false',
            {
              method: 'POST',
              body: formData,
            },
          )

          if (activeSessionRef.current !== sessionId) {
            return
          }

          if (response.provider) {
            setRecognitionProvider(response.provider)
          }
          setRecognitionUsedFallback(Boolean(response.used_fallback))

          if (response.error && response.error.toLowerCase().includes('no speech detected')) {
            noSpeechChunkCountRef.current += 1
            if (noSpeechChunkCountRef.current >= 2) {
              setError('未偵測到清楚語音，請靠近麥克風並提高音量後再試。')
            }
            setPartialText('')
            return
          }

          const text = (response.text || '').trim()
          if (text) {
            noSpeechChunkCountRef.current = 0
            setError((current) => (current && current.includes('未偵測到清楚語音') ? null : current))
            appendTranscriptText(text)
          }

          setPartialText('')
        } catch (unknownError) {
          if (activeSessionRef.current !== sessionId) {
            return
          }
          const message = unknownError instanceof Error ? unknownError.message : '語音轉錄失敗'
          setError(message)
          setPartialText('')
        }
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        const uploadChunk = async (): Promise<void> => {
          if (!event.data || !event.data.size || activeSessionRef.current !== sessionId) {
            return
          }

          const normalizedChunk = normalizeChunk(event.data)
          if (normalizedChunk.size < MIN_CHUNK_BYTES) {
            return
          }

          const withinSpeechWindow = speechLikelyRef.current || recentSpeechMsRef.current > 0
          if (!withinSpeechWindow) {
            if (pendingSpeechChunksRef.current.length) {
              await flushPendingChunks()
            }
            preRollChunkRef.current = normalizedChunk
            return
          }

          if (preRollChunkRef.current && pendingSpeechChunksRef.current.length === 0) {
            pendingSpeechChunksRef.current.push(preRollChunkRef.current)
            pendingSpeechBytesRef.current += preRollChunkRef.current.size
            preRollChunkRef.current = null
          }

          pendingSpeechChunksRef.current.push(normalizedChunk)
          pendingSpeechBytesRef.current += normalizedChunk.size

          if (pendingSpeechBytesRef.current < MIN_BATCH_UPLOAD_BYTES) {
            return
          }

          await flushPendingChunks()
        }

        uploadQueueRef.current = uploadQueueRef.current
          .then(uploadChunk)
          .catch(() => {
            // keep queue alive
          })
      }

      recorder.onerror = (event: Event) => {
        const recorderError = (event as unknown as { error?: { message?: string } })?.error?.message
        setError(recorderError || '錄音裝置錯誤，請檢查麥克風權限與裝置狀態。')
        setIsListening(false)
      }

      recorder.onstop = () => {
        uploadQueueRef.current = uploadQueueRef.current.then(async () => {
          if (pendingSpeechChunksRef.current.length) {
            const extension = mimeType?.includes('mp4') ? 'mp4' : mimeType?.includes('ogg') ? 'ogg' : 'webm'
            const leadingChunk = carryOverChunkRef.current
            const pendingChunks = pendingSpeechChunksRef.current
            const payloadBlob = new Blob(
              leadingChunk ? [leadingChunk, ...pendingChunks] : pendingChunks,
              {
                type: pendingChunks[pendingChunks.length - 1]?.type || mimeType || 'audio/webm',
              },
            )
            pendingSpeechChunksRef.current = []
            pendingSpeechBytesRef.current = 0

            const file = new File([payloadBlob], `chunk-${Date.now()}.${extension}`, {
              type: payloadBlob.type || mimeType || 'audio/webm',
            })
            const formData = new FormData()
            formData.append('file', file)

            try {
              const response = await request<SpeechTranscribeResponse>(
                '/speech/transcribe?language=zh-TW&prefer_local=false',
                {
                  method: 'POST',
                  body: formData,
                },
              )

              if (response.provider) {
                setRecognitionProvider(response.provider)
              }
              setRecognitionUsedFallback(Boolean(response.used_fallback))

              const text = (response.text || '').trim()
              if (text) {
                noSpeechChunkCountRef.current = 0
                setError((current) => (current && current.includes('未偵測到清楚語音') ? null : current))
                appendTranscriptText(text)
              }
            } catch {
              // ignore final flush errors
            }
          }
        })

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        stopAudioAnalysis()

        recorderRef.current = null
        initializationChunkRef.current = null
        preRollChunkRef.current = null
        carryOverChunkRef.current = null
        pendingSpeechChunksRef.current = []
        pendingSpeechBytesRef.current = 0
        if (!isStoppingRef.current) {
          setIsListening(false)
        }
      }

      recorder.start(RECORDER_TIMESLICE_MS)
      setIsListening(true)
    } catch (unknownError) {
      const message =
        unknownError instanceof Error ? unknownError.message : 'Unable to start recording.'
      setError(message)
      setIsListening(false)
    }
  }, [isListening, isSupported, startAudioAnalysis, startedAt, stopAudioAnalysis])

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
    recognitionProvider,
    recognitionUsedFallback,
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
