/**
 * Azure Speech Integration Example for Meeting Page
 * 
 * This file shows how to integrate Azure Speech-to-Text into the existing meeting page.
 * You can use this as a reference to update src/renderer/src/pages/meeting/meeting.tsx
 */

import { useCallback, useEffect, useState } from 'react';
import { useAzureSpeech } from '@/hooks/useAzureSpeech';

/**
 * Example Component: Speech Recognition Overlay
 * 
 * Add this to your MeetingPage component to enable Azure Speech transcription
 */
export function SpeechRecognitionPanel({ interviewId }: { interviewId: number }) {
  const speech = useAzureSpeech({
    interviewId,
    language: 'zh-TW',
    autoStartOnInit: false,
    enableLocalFallback: true,
  });

  const [serviceStatus, setServiceStatus] = useState<any>(null);

  // Check service availability on mount
  useEffect(() => {
    speech.getServiceStatus().then(setServiceStatus);
  }, [speech]);

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Live Transcription (Azure Speech)</h3>
        {speech.isListening && (
          <span className="inline-flex items-center gap-2 text-sm text-amber-600">
            <span className="animate-pulse">🎤</span>
            Recording...
          </span>
        )}
      </div>

      {/* Service Status */}
      {serviceStatus && !serviceStatus.can_transcribe && (
        <div className="rounded bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ Speech recognition services not available. 
          {serviceStatus.primary_service === 'none' && (
            <span> Please configure Azure Speech or enable Whisper in settings.</span>
          )}
        </div>
      )}

      {/* Interim/Partial Text */}
      {speech.partialText && (
        <p className="rounded bg-blue-50 p-2 text-sm italic text-blue-900">
          {speech.partialText}
        </p>
      )}

      {/* Transcript Entries */}
      <div className="max-h-48 space-y-2 overflow-y-auto rounded bg-slate-50 p-3">
        {speech.transcriptEntries.length === 0 ? (
          <p className="text-center text-sm text-slate-500">
            {speech.isListening ? 'Waiting for speech...' : 'Transcript entries will appear here'}
          </p>
        ) : (
          speech.transcriptEntries.map((entry) => (
            <div key={entry.id} className="flex justify-between gap-2 border-b border-slate-200 pb-2 text-sm">
              <p className="flex-1">{entry.text}</p>
              <span className="whitespace-nowrap text-xs text-slate-500">
                {(entry.confidence * 100).toFixed(0)}%
              </span>
            </div>
          ))
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => speech.startListening()}
          disabled={speech.isListening || !serviceStatus?.can_transcribe}
          className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Start Recording
        </button>
        <button
          onClick={() => speech.stopListening()}
          disabled={!speech.isListening}
          className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          Stop Recording
        </button>
        <button
          onClick={() => speech.clearTranscript()}
          className="flex-1 rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Clear
        </button>
      </div>

      {/* Error Display */}
      {speech.error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-800">
          <strong>Error:</strong> {speech.error}
        </div>
      )}

      {/* Stats */}
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <div>
          <span className="font-semibold">{speech.transcriptEntries.length}</span> entries
        </div>
        <div>
          <span className="font-semibold">{speech.getTranscriptText().length}</span> characters
        </div>
        <div>
          Language: <span className="font-semibold">{speech.currentLanguage}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Integration into Meeting Page
 * 
 * Replace the existing speech recognition section with this enhanced version:
 * 
 * function MeetingPage() {
 *   const [interviewId] = useState(123);
 * 
 *   return (
 *     <div className="space-y-4">
 *       {- ... existing meeting UI ... -}
 *       
 *       {- Replace old speech section -}
 *       <SpeechRecognitionPanel interviewId={interviewId} />
 *       
 *       {- ... rest of meeting UI ... -}
 *     </div>
 *   );
 * }
 */

/**
 * Alternative: Using Backend API for Transcription
 * 
 * If you prefer to send audio to the backend for transcription:
 */
export function BackendTranscriptionExample({ interviewId }: { interviewId: number }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        // Send to backend
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.wav');
        formData.append('language', 'zh-TW');

        try {
          const response = await fetch('/api/v1/speech/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) throw new Error('Transcription failed');

          const result = await response.json();
          setTranscript(result.text);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }

        // Cleanup
        stream.getTracks().forEach((track) => track.stop());
        audioChunksRef.current = [];
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={startRecording}
          disabled={isRecording}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
        >
          Start
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
        >
          Stop
        </button>
      </div>

      {transcript && (
        <div className="p-3 bg-green-50 rounded text-sm text-green-900">
          <strong>Transcription:</strong> {transcript}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 rounded text-sm text-red-900">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

// Export for use in meeting page
export default SpeechRecognitionPanel;
