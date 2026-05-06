/**
 * useAzureSpeech Hook
 *
 * React hook for integrating Azure Speech recognition into components.
 * Handles microphone input, continuous recognition, and fallback to backend API.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { azureSpeechService, type SpeechRecognitionConfig } from '../services/azureSpeech'
import { request } from '../api/http'

export interface TranscriptEntry {
  id: string
  text: string
  timestamp: number
  language: string
  confidence: number
}

export interface UseAzureSpeechOptions {
  interviewId?: number
  language?: string
  autoStartOnInit?: boolean
  enableLocalFallback?: boolean
}

export interface UseAzureSpeechResult {
  isListening: boolean
  isSupported: boolean
  error: string | null
  partialText: string
  transcriptEntries: TranscriptEntry[]
  currentLanguage: string

  startListening: () => Promise<void>
  stopListening: () => Promise<void>
  clearTranscript: () => void
  getTranscriptText: () => string
  getServiceStatus: () => Promise<{
    azure_configured: boolean
    whisper_enabled: boolean
    primary_service: string
    can_transcribe: boolean
  }>
}

/**
 * Hook for using Azure Speech recognition in React components
 */
export function useAzureSpeech(options: UseAzureSpeechOptions = {}): UseAzureSpeechResult {
  const {
    interviewId = 0,
    language = 'zh-TW',
    autoStartOnInit = false,
    enableLocalFallback = true
  } = options

  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(true) // Azure SDK support check should be done in useEffect
  const [error, setError] = useState<string | null>(null)
  const [partialText, setPartialText] = useState('')
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [currentLanguage] = useState(language)

  const entryCountRef = useRef(0)
  const recognitionConfigRef = useRef<SpeechRecognitionConfig | null>(null)

  /**
   * Initialize speech recognition config
   */
  useEffect(() => {
    recognitionConfigRef.current = {
      azureKey: import.meta.env.VITE_AZURE_SPEECH_KEY || '',
      azureRegion: import.meta.env.VITE_AZURE_SPEECH_REGION || 'eastasia',
      language: currentLanguage,
      preferredProcessingLanguage: currentLanguage
    }
  }, [currentLanguage])

  /**
   * Setup Azure Speech callbacks
   */
  useEffect(() => {
    azureSpeechService.on({
      onStatus: (message: string) => {
        console.log('[Azure Speech Status]', message)
      },
      onError: (error: Error) => {
        console.error('[Azure Speech Error]', error)
        setError(error.message)
        setIsListening(false)

        // Try backend API fallback if enabled
        if (enableLocalFallback) {
          console.log('[Azure Speech] Attempting backend fallback...')
        }
      },
      onRecognizing: (data: { text: string }) => {
        setPartialText(data.text)
      },
      onRecognized: (data) => {
        if (!data.text) return

        const entry: TranscriptEntry = {
          id: `entry-${interviewId}-${entryCountRef.current++}`,
          text: data.text,
          timestamp: data.resultAt,
          language: data.language || currentLanguage,
          confidence: data.rawJson?.NBest?.[0]?.Confidence || 0
        }

        setTranscriptEntries((prev) => [...prev, entry])
        setPartialText('')
      }
    })

    return () => {
      // Cleanup if needed
    }
  }, [currentLanguage, interviewId, enableLocalFallback])

  /**
   * Start listening to microphone
   */
  const startListening = useCallback(async () => {
    if (isListening) return

    try {
      setError(null)

      // Check if Azure Speech SDK is loaded
      if (!(window as any).SpeechSDK) {
        throw new Error(
          'Azure Speech SDK not loaded. Please ensure the SDK script is included in your HTML.'
        )
      }

      if (!recognitionConfigRef.current?.azureKey) {
        throw new Error('Azure Speech credentials not configured')
      }

      await azureSpeechService.start(recognitionConfigRef.current)
      setIsListening(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start listening'
      setError(message)
      console.error('[useAzureSpeech]', message)
    }
  }, [isListening])

  /**
   * Stop listening
   */
  const stopListening = useCallback(async () => {
    try {
      await azureSpeechService.stop()
      setIsListening(false)
      setPartialText('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop listening'
      setError(message)
    }
  }, [])

  /**
   * Clear transcript
   */
  const clearTranscript = useCallback(() => {
    setTranscriptEntries([])
    setPartialText('')
    entryCountRef.current = 0
  }, [])

  /**
   * Get full transcript as text
   */
  const getTranscriptText = useCallback((): string => {
    return transcriptEntries.map((entry) => entry.text).join('\n\n')
  }, [transcriptEntries])

  /**
   * Get backend service status
   */
  const getServiceStatus = useCallback(async () => {
    try {
      return await request<{
        azure_configured: boolean
        whisper_enabled: boolean
        primary_service: string
        can_transcribe: boolean
      }>('/speech/status')
    } catch (err) {
      console.error('Failed to get speech service status:', err)
      return {
        azure_configured: false,
        whisper_enabled: false,
        primary_service: 'none',
        can_transcribe: false
      }
    }
  }, [])

  /**
   * Auto-start listening if configured
   */
  useEffect(() => {
    if (autoStartOnInit && isSupported && !isListening && !error) {
      startListening().catch(console.error)
    }

    return () => {
      if (isListening) {
        stopListening().catch(console.error)
      }
    }
  }, [autoStartOnInit, isSupported, isListening, error, startListening, stopListening])

  return {
    isListening,
    isSupported,
    error,
    partialText,
    transcriptEntries,
    currentLanguage,
    startListening,
    stopListening,
    clearTranscript,
    getTranscriptText,
    getServiceStatus
  }
}
