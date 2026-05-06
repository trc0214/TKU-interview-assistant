# Speech Recognition Integration Guide

## Overview

The speech processing workflow now supports **Azure Speech-to-Text (Primary)** with **Whisper (Fallback)** for robust transcription capabilities.

### Architecture

```
Browser Speech Input
    ↓
Azure Speech SDK (Frontend) OR Backend API
    ↓
Azure Speech Service (Cloud)
    ↓ [if fails]
Whisper Service (Local)
    ↓
Transcript & Confidence Score
```

## Setup Instructions

### 1. Backend Configuration

#### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### Set Environment Variables

```bash
# backend/.env
AZURE_SPEECH_KEY=your_azure_key_here
AZURE_SPEECH_REGION=eastasia
AZURE_SPEECH_LANGUAGE=zh-TW

WHISPER_MODEL=base          # Options: tiny, base, small, medium, large
WHISPER_DEVICE=cpu          # Or: cuda (for GPU)
WHISPER_USE_FALLBACK=true
```

#### Get Azure Speech Credentials

1. Create an Azure account: https://portal.azure.com
2. Create a "Speech" resource
3. Copy Key and Region to .env file

### 2. Frontend Configuration

#### Update Environment

```bash
# src/renderer/.env.local
VITE_AZURE_SPEECH_KEY=your_azure_key_here
VITE_AZURE_SPEECH_REGION=eastasia
VITE_ENABLE_AZURE_SPEECH=true
VITE_ENABLE_LOCAL_SPEECH_FALLBACK=true
```

#### Azure Speech SDK

The SDK is automatically loaded via CDN in `src/renderer/index.html`.

## Usage Examples

### Backend API: Transcribe Audio File

```typescript
// Frontend - Upload and transcribe
const formData = new FormData()
formData.append('file', audioFile)
formData.append('language', 'zh-TW')

const response = await fetch('/api/v1/speech/transcribe', {
  method: 'POST',
  body: formData
})

const result = await response.json()
console.log(result.text) // Transcribed text
console.log(result.provider) // 'azure' or 'whisper'
console.log(result.used_fallback) // Whether fallback was used
```

### Backend API: Get Service Status

```typescript
const response = await fetch('/api/v1/speech/status')
const status = await response.json()

console.log(status)
// {
//   "azure_configured": true,
//   "whisper_enabled": true,
//   "primary_service": "azure",
//   "can_transcribe": true
// }
```

### Frontend: Use Azure Speech Hook in React

```typescript
import { useAzureSpeech } from '@/hooks/useAzureSpeech';

export function MeetingTranscript() {
  const speech = useAzureSpeech({
    interviewId: 123,
    language: 'zh-TW',
    autoStartOnInit: false,
    enableLocalFallback: true
  });

  return (
    <div>
      <h3>Transcript</h3>
      {speech.isListening && <p>🎤 Listening...</p>}

      <p>Partial: {speech.partialText}</p>

      <div>
        {speech.transcriptEntries.map(entry => (
          <p key={entry.id}>{entry.text}</p>
        ))}
      </div>

      <button onClick={() => speech.startListening()}>
        Start
      </button>
      <button onClick={() => speech.stopListening()}>
        Stop
      </button>

      {speech.error && <p style={{ color: 'red' }}>{speech.error}</p>}
    </div>
  );
}
```

### Frontend: Direct Azure Speech Service

```typescript
import { azureSpeechService } from '@/services/azureSpeech'

azureSpeechService.on({
  onRecognizing: (data) => console.log('Recognizing:', data.text),
  onRecognized: (data) => console.log('Recognized:', data.text),
  onError: (error) => console.error('Error:', error)
})

await azureSpeechService.start({
  azureKey: 'YOUR_KEY',
  azureRegion: 'eastasia',
  language: 'zh-TW'
})

// ... do speech recognition ...

await azureSpeechService.stop()
```

## Integration with Meeting Page

Update `src/renderer/src/pages/meeting/meeting.tsx`:

```typescript
import { useAzureSpeech } from '@/hooks/useAzureSpeech';

export function MeetingPage() {
  const interviewId = // ... get from URL/state

  // Add Azure Speech alongside existing recognition
  const azureSpeech = useAzureSpeech({
    interviewId,
    language: 'zh-TW',
    enableLocalFallback: true
  });

  const handleStartRecording = async () => {
    try {
      await azureSpeech.startListening();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    await azureSpeech.stopListening();
    // Process transcript entries
    const transcript = azureSpeech.getTranscriptText();
  };

  return (
    <div>
      {/* ... existing meeting UI ... */}

      <div className="transcript-section">
        <h3>Live Transcript (Azure Speech)</h3>
        {azureSpeech.isListening && <span>🎤 Recording...</span>}

        {azureSpeech.partialText && (
          <p className="interim">{azureSpeech.partialText}</p>
        )}

        <div>
          {azureSpeech.transcriptEntries.map(entry => (
            <p key={entry.id}>
              {entry.text}
              <small>{(entry.confidence * 100).toFixed(0)}% confident</small>
            </p>
          ))}
        </div>

        <button onClick={handleStartRecording} disabled={azureSpeech.isListening}>
          Start
        </button>
        <button onClick={handleStopRecording} disabled={!azureSpeech.isListening}>
          Stop
        </button>
        <button onClick={() => azureSpeech.clearTranscript()}>
          Clear
        </button>

        {azureSpeech.error && (
          <p style={{ color: 'red' }}>Error: {azureSpeech.error}</p>
        )}
      </div>
    </div>
  );
}
```

## Troubleshooting

### Azure Speech SDK Not Loaded

**Issue**: "Azure Speech SDK is not loaded"
**Solution**:

- Check that index.html includes `<script src="https://aka.ms/csspeech/jsbrowserpackageraw"></script>`
- Verify CSP allows scripts from https://aka.ms

### No Transcription Results

**Issue**: Audio isn't being transcribed
**Solution**:

1. Check microphone permissions
2. Verify Azure credentials in environment variables
3. Check browser console for errors
4. Ensure language code matches audio (e.g., 'zh-TW' for Mandarin)

### Whisper Model Too Large

**Issue**: Large model file (2.7GB for 'large')
**Solution**:

- Use smaller model: base (140MB), small (450MB)
- Pre-download model: `python -c "import whisper; whisper.load_model('base')"`
- Consider using Docker with pre-loaded model

### Azure Service Quota Exceeded

**Issue**: "Quota exceeded" errors
**Solution**:

1. Check Azure subscription quota
2. Enable Whisper fallback for backup
3. Implement request rate limiting

## Performance Tuning

### Reduce Latency

1. Use `base` or `small` Whisper model
2. Set WHISPER_DEVICE=cuda (if GPU available)
3. Configure Azure region closest to users

### Reduce Memory Usage

1. Use `tiny` Whisper model (74MB, 4GB RAM)
2. Unload Whisper model when not needed: `service.unload_model()`

## Security Considerations

### Frontend Key Exposure

**NOT RECOMMENDED** to store Azure keys in frontend .env files.

**RECOMMENDED**: Authenticate through backend

```typescript
// Option A: Backend returns signed token
const token = await fetch('/api/v1/auth/azure-speech-token')

// Option B: Client uploads audio to backend
const formData = new FormData()
formData.append('file', audioBlob)
const result = await fetch('/api/v1/speech/transcribe', { method: 'POST', body: formData })
```

### API Key Management

- Use Azure Key Vault for production
- Rotate keys regularly
- Use dedicated Speech API keys (not database keys)

## API Reference

### Backend Endpoints

#### POST `/api/v1/speech/transcribe`

Transcribe uploaded audio file

**Request:**

```
Content-Type: multipart/form-data
file: (binary audio data)
language: (optional) e.g., 'zh-TW'
prefer_local: (optional) boolean - try Whisper first
```

**Response:**

```json
{
  "text": "辨識出的文字",
  "language": "zh-TW",
  "confidence": 0.95,
  "provider": "azure",
  "used_fallback": false,
  "error": null
}
```

#### GET `/api/v1/speech/status`

Get service availability and configuration

**Response:**

```json
{
  "azure_configured": true,
  "whisper_enabled": true,
  "primary_service": "azure",
  "can_transcribe": true
}
```

## Environment Variables Summary

### Backend (.env or .env.example)

| Variable              | Default  | Description                                           |
| --------------------- | -------- | ----------------------------------------------------- |
| AZURE_SPEECH_KEY      | (empty)  | Microsoft Azure Speech API key                        |
| AZURE_SPEECH_REGION   | eastasia | Azure region (eastasia, eastus, westeurope, etc.)     |
| AZURE_SPEECH_LANGUAGE | zh-TW    | Default language for recognition                      |
| WHISPER_MODEL         | base     | Whisper model size (tiny, base, small, medium, large) |
| WHISPER_DEVICE        | cpu      | Compute device (cpu, cuda)                            |
| WHISPER_USE_FALLBACK  | true     | Enable Whisper as fallback                            |

### Frontend (.env.local or .env.example)

| Variable                          | Default  | Description                                           |
| --------------------------------- | -------- | ----------------------------------------------------- |
| VITE_AZURE_SPEECH_KEY             | (empty)  | Azure Speech API key (not recommended for production) |
| VITE_AZURE_SPEECH_REGION          | eastasia | Azure region                                          |
| VITE_ENABLE_AZURE_SPEECH          | true     | Enable Azure Speech in frontend                       |
| VITE_ENABLE_LOCAL_SPEECH_FALLBACK | true     | Enable local fallback                                 |
| VITE_SPEECH_DEFAULT_LANGUAGE      | zh-TW    | Default speech language                               |

## References

- [Azure Speech Documentation](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [Azure Speech SDK for JavaScript](https://docs.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/)
