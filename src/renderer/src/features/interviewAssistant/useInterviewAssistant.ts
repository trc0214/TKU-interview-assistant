import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { request } from '../../api/http'
import { clearDraft, loadDraft, saveDraft } from './storage'
import {
  buildInterviewNotes,
  buildTranscriptEntry,
  collectTopTerms,
  sanitizeTranscriptText,
  type TranscriptEntry
} from './transcript'

const AUDIO_QUALITY_POLL_MS = 180
const RECORDER_TIMESLICE_MS = 2000
const SILENCE_RELEASE_MS = 650
const MIN_CHUNK_BYTES = 8192
const MIN_BATCH_UPLOAD_BYTES = 22000
const SPEECH_RMS_THRESHOLD = 0.006 // 降低閾值，原為 0.012
const NOISE_RMS_THRESHOLD = 0.015 // 降低閾值，原為 0.018
const LOW_VOLUME_RMS_THRESHOLD = 0.004 // 降低閾值，原為 0.01
const MIN_TRANSCRIPT_TEXT_LENGTH = 2
const MERGE_WINDOW_MS = 8000
const SHORT_FRAGMENT_LENGTH = 18
const HIGH_SIMILARITY_THRESHOLD = 0.88
const FORCE_UPLOAD_SILENT_CHUNKS = 3
const LOW_VOLUME_TIMEOUT_MS = 600 // 從 1500ms 降低為更快反應，原隱含為 1500

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
    typeof window.MediaRecorder !== 'undefined'
  )
}

function resolveRecorderMimeType(): string | undefined {
  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/wav' // 添加 WAV 作為備選，最兼容
  ]

  for (const mimeType of preferredTypes) {
    if (window.MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  return undefined
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[，。！？,.!?、;；:："'`~^*()[\]{}<>|_-]+/g, '')
    .trim()
}

function calculateTextSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1

  const leftSet = new Set(left.split('').filter(Boolean))
  const rightSet = new Set(right.split('').filter(Boolean))
  if (!leftSet.size || !rightSet.size) return 0

  let intersection = 0
  leftSet.forEach((char) => {
    if (rightSet.has(char)) {
      intersection += 1
    }
  })

  const union = new Set([...leftSet, ...rightSet]).size
  return union ? intersection / union : 0
}

type InitParams = {
  interviewId?: number
  interviewer?: string
  candidateName?: string
  language?: string
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
  candidateName,
  language = 'zh-TW'
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
  const lastFlushAtRef = useRef(0)
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve())
  const noSpeechChunkCountRef = useRef(0)
  const silentChunkStreakRef = useRef(0)
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
      peak
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
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      return
    }

    try {
      const context = new AudioContextCtor()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()

      // 添加音頻增益放大器，改善低音量檢測
      const gainNode = context.createGain()
      gainNode.gain.value = 2.0 // 2x 增益

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.65

      // 連接：source → gainNode → analyser
      source.connect(gainNode)
      gainNode.connect(analyser)

      audioContextRef.current = context
      analyserRef.current = analyser

      const bucket = new Uint8Array(analyser.frequencyBinCount)
      analysisTimerRef.current = window.setInterval(() => {
        if (!analyserRef.current) {
          return
        }

        analyserRef.current.getByteTimeDomainData(bucket)
        const { rms, peak } = computeRmsAndPeak(bucket)
        const hasSpeech =
          rms >= SPEECH_RMS_THRESHOLD || (peak >= 0.08 && rms >= LOW_VOLUME_RMS_THRESHOLD * 1.5)
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
        lowVolumeMsRef.current =
          rms < LOW_VOLUME_RMS_THRESHOLD
            ? lowVolumeMsRef.current + AUDIO_QUALITY_POLL_MS
            : Math.max(0, lowVolumeMsRef.current - AUDIO_QUALITY_POLL_MS)
        highNoiseMsRef.current =
          rms > NOISE_RMS_THRESHOLD
            ? highNoiseMsRef.current + AUDIO_QUALITY_POLL_MS
            : Math.max(0, highNoiseMsRef.current - AUDIO_QUALITY_POLL_MS)
        clippingMsRef.current =
          peak > 0.98
            ? clippingMsRef.current + AUDIO_QUALITY_POLL_MS
            : Math.max(0, clippingMsRef.current - AUDIO_QUALITY_POLL_MS)

        let issue: AudioIssue = null
        if (clippingMsRef.current >= 360) {
          issue = 'clipping'
        } else if (highNoiseMsRef.current >= 1200) {
          issue = 'high-noise'
        } else if (lowVolumeMsRef.current >= LOW_VOLUME_TIMEOUT_MS) {
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
    silentChunkStreakRef.current = 0
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
          autoGainControl: true
        }
      })
      streamRef.current = stream
      startAudioAnalysis(stream)

      const mimeType = resolveRecorderMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder
      initializationChunkRef.current = null
      carryOverChunkRef.current = null
      pendingSpeechChunksRef.current = []
      pendingSpeechBytesRef.current = 0
      silentChunkStreakRef.current = 0

      const isLikelyWebm = (mimeType || '').includes('webm')
      const isLikelyMp4 = (mimeType || '').includes('mp4')

      const normalizeChunk = (chunk: Blob): Blob => {
        if (!chunk.size) return chunk

        // 非 container 格式直接回傳
        if (!isLikelyWebm && !isLikelyMp4) {
          return chunk
        }

        // 第一個拿到的塊通常包含初始化/headers（保留但不複製到每個塊）
        if (!initializationChunkRef.current) {
          initializationChunkRef.current = chunk
          // 返回原始塊，但不要在此處將初始化段附加到後續塊上
          return chunk
        }

        // 對於後續塊，僅返回原始數據塊；最終組合時會在最前面加上初始化段
        return chunk
      }

      const appendTranscriptText = (incomingText: string): void => {
        const text = sanitizeTranscriptText(incomingText)
        if (text.length < MIN_TRANSCRIPT_TEXT_LENGTH) {
          return
        }

        setTranscriptEntries((previous) => {
          const last = previous[previous.length - 1]
          if (!last) {
            const entry = buildTranscriptEntry(text)
            if (!entry.text) {
              return previous
            }
            return [...previous, entry]
          }

          const normalizedText = normalizeForComparison(text)
          const normalizedLast = normalizeForComparison(last.text)
          const similarity = calculateTextSimilarity(normalizedText, normalizedLast)

          const isDuplicate =
            normalizedText === normalizedLast ||
            normalizedLast.includes(normalizedText) ||
            (normalizedText.includes(normalizedLast) &&
              normalizedText.length - normalizedLast.length <= 12) ||
            similarity >= HIGH_SIMILARITY_THRESHOLD

          if (isDuplicate) {
            if (text.length > last.text.length) {
              const replacement = buildTranscriptEntry(text, last.createdAt)
              if (!replacement.text) {
                return previous
              }
              return [...previous.slice(0, -1), replacement]
            }
            return previous
          }

          const shouldMerge =
            Date.now() - last.createdAt <= MERGE_WINDOW_MS &&
            (text.length <= SHORT_FRAGMENT_LENGTH || !/[。！？.!?]$/.test(last.text))

          if (shouldMerge) {
            const separator = /^[，。！？,.!?]/.test(text) ? '' : ' '
            const mergedText = sanitizeTranscriptText(`${last.text}${separator}${text}`)
            if (!mergedText) {
              return previous
            }
            const mergedEntry = buildTranscriptEntry(mergedText, last.createdAt)
            if (!mergedEntry.text) {
              return previous
            }
            return [...previous.slice(0, -1), mergedEntry]
          }

          const nextEntry = buildTranscriptEntry(text)
          if (!nextEntry.text) {
            return previous
          }
          return [...previous, nextEntry]
        })

        setUpdatedAt(Date.now())
      }

      const flushPendingChunks = async (): Promise<void> => {
        const pendingChunks = pendingSpeechChunksRef.current
        if (!pendingChunks.length) {
          return
        }

        // rate-limit frequent flushes (helps prevent repeated rapid POSTs)
        const now = Date.now()
        if (now - lastFlushAtRef.current < 700 && pendingSpeechBytesRef.current < MIN_BATCH_UPLOAD_BYTES * 2) {
          return
        }
        lastFlushAtRef.current = now

        const extension = mimeType?.includes('mp4')
          ? 'mp4'
          : mimeType?.includes('ogg')
            ? 'ogg'
            : mimeType?.includes('wav')
              ? 'wav'
              : 'webm'

        // 構建 blob：確保只有一個初始化段在最前面，且不重複
        const blobParts: Blob[] = []

        if (initializationChunkRef.current) {
          blobParts.push(initializationChunkRef.current)
        }

        // 添加所有待機塊，但避免將相同的 initialization chunk 重複加入
        for (const part of pendingChunks) {
          if (initializationChunkRef.current && part === initializationChunkRef.current) {
            // skip duplicate
            continue
          }
          blobParts.push(part)
        }

        const payloadBlob = new Blob(blobParts, {
          type: mimeType || 'audio/webm'
        })

        pendingSpeechChunksRef.current = []
        pendingSpeechBytesRef.current = 0
        carryOverChunkRef.current = pendingChunks[pendingChunks.length - 1] || null

        try {
          setPartialText('辨識中…')

          const file = new File([payloadBlob], `chunk-${Date.now()}.${extension}`, {
            type: mimeType || 'audio/webm'
          })
          const formData = new FormData()
          formData.append('file', file)

          const response = await request<SpeechTranscribeResponse>(
            `/speech/transcribe?language=${encodeURIComponent(language)}&prefer_local=false`,
            {
              method: 'POST',
              body: formData
            }
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
            setError((current) =>
              current && current.includes('未偵測到清楚語音') ? null : current
            )
            appendTranscriptText(text)
          }

          setPartialText('')
        } catch (unknownError) {
          if (activeSessionRef.current !== sessionId) {
            return
          }
          let message = '語音轉錄失敗'

          // Handle ApiError from request function
          if (unknownError && typeof unknownError === 'object' && 'status' in unknownError) {
            const apiError = unknownError as { status: number; detail?: unknown; message?: string }
            const status = apiError.status
            const detail = String(apiError.detail || apiError.message || '')

            if (status === 400) {
              message = `無效的音頻格式: ${detail}`
            } else if (status === 401 || status === 403) {
              message = '認證失敗，請重新登入。'
            } else if (status === 404) {
              message = '轉錄服務暫不可用。'
            } else if (status === 503) {
              message = `語音轉錄服務無法使用: ${detail}`
            } else if (status >= 500) {
              message = `伺服器錯誤 (${status}): ${detail || '請稍後重試。'}`
            }
          } else if (unknownError instanceof Error) {
            const errorMsg = unknownError.message.toLowerCase()
            if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
              message = '網路連線錯誤，請檢查網路狀態。'
            } else if (errorMsg.includes('timeout')) {
              message = '伺服器無回應，請稍後重試。'
            } else {
              message = unknownError.message || message
            }
          }
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
            silentChunkStreakRef.current += 1
            if (pendingSpeechChunksRef.current.length) {
              await flushPendingChunks()
            }

            if (silentChunkStreakRef.current >= FORCE_UPLOAD_SILENT_CHUNKS) {
              if (preRollChunkRef.current && pendingSpeechChunksRef.current.length === 0) {
                // avoid pushing initialization chunk twice
                if (!(initializationChunkRef.current && preRollChunkRef.current === initializationChunkRef.current)) {
                  pendingSpeechChunksRef.current.push(preRollChunkRef.current)
                  pendingSpeechBytesRef.current += preRollChunkRef.current.size
                }
                preRollChunkRef.current = null
              }

              if (!(initializationChunkRef.current && normalizedChunk === initializationChunkRef.current)) {
                pendingSpeechChunksRef.current.push(normalizedChunk)
                pendingSpeechBytesRef.current += normalizedChunk.size
              }

              await flushPendingChunks()
              silentChunkStreakRef.current = 0
              return
            }

            preRollChunkRef.current = normalizedChunk
            return
          }

          silentChunkStreakRef.current = 0

          if (preRollChunkRef.current && pendingSpeechChunksRef.current.length === 0) {
            if (!(initializationChunkRef.current && preRollChunkRef.current === initializationChunkRef.current)) {
              pendingSpeechChunksRef.current.push(preRollChunkRef.current)
              pendingSpeechBytesRef.current += preRollChunkRef.current.size
            }
            preRollChunkRef.current = null
          }

          if (!(initializationChunkRef.current && normalizedChunk === initializationChunkRef.current)) {
            pendingSpeechChunksRef.current.push(normalizedChunk)
            pendingSpeechBytesRef.current += normalizedChunk.size
          }

          if (pendingSpeechBytesRef.current < MIN_BATCH_UPLOAD_BYTES) {
            return
          }

          await flushPendingChunks()
        }

        uploadQueueRef.current = uploadQueueRef.current.then(uploadChunk).catch(() => {
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
            const extension = mimeType?.includes('mp4')
              ? 'mp4'
              : mimeType?.includes('ogg')
                ? 'ogg'
                : mimeType?.includes('wav')
                  ? 'wav'
                  : 'webm'
            const pendingChunks = pendingSpeechChunksRef.current

            // 構建 blob：確保只有一個初始化段在最前面，且不重複（與 flushPendingChunks 一致）
            const blobParts: Blob[] = []
            if (initializationChunkRef.current) {
              blobParts.push(initializationChunkRef.current)
            }

            for (const part of pendingChunks) {
              if (initializationChunkRef.current && part === initializationChunkRef.current) {
                continue
              }
              blobParts.push(part)
            }

            const payloadBlob = new Blob(blobParts, {
              type: mimeType || 'audio/webm'
            })
            pendingSpeechChunksRef.current = []
            pendingSpeechBytesRef.current = 0

            const file = new File([payloadBlob], `chunk-${Date.now()}.${extension}`, {
              type: mimeType || 'audio/webm'
            })
            const formData = new FormData()
            formData.append('file', file)

            try {
              const response = await request<SpeechTranscribeResponse>(
                `/speech/transcribe?language=${encodeURIComponent(language)}&prefer_local=false`,
                {
                  method: 'POST',
                  body: formData
                }
              )

              if (response.provider) {
                setRecognitionProvider(response.provider)
              }
              setRecognitionUsedFallback(Boolean(response.used_fallback))

              const text = (response.text || '').trim()
              if (text) {
                noSpeechChunkCountRef.current = 0
                setError((current) =>
                  current && current.includes('未偵測到清楚語音') ? null : current
                )
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
        silentChunkStreakRef.current = 0
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
  }, [isListening, isSupported, startAudioAnalysis, startedAt, stopAudioAnalysis, language])

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
