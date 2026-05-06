# Speech Processing Refactoring - Implementation Summary

## Overview

The interview assistant's speech processing workflow has been successfully refactored to use **Azure Speech-to-Text** (primary) with **OpenAI Whisper** (local fallback) as per the project requirements.

## What Was Implemented

### Backend (Python/FastAPI)

#### 1. **Azure Speech Service** (`backend/app/services/azure_speech.py`)

- Cloud-based speech recognition via Microsoft Azure Cognitive Services
- Supports 100+ languages with automatic language detection
- Provides:
  - Full recognized text
  - Word-level timing and confidence scores
  - Detailed JSON results from Azure API
  - Error handling and graceful timeouts

#### 2. **Whisper Service** (`backend/app/services/whisper.py`)

- Local speech recognition using OpenAI's Whisper model
- Runs completely offline (no API keys needed)
- Features:
  - Multiple model sizes (tiny: 74MB → large: 2.9GB)
  - GPU support (CUDA) or CPU processing
  - Segment-level results with confidence
  - Language auto-detection
  - Fallback mechanism documentation

#### 3. **Unified Speech Service** (`backend/app/services/unified_speech.py`)

- Intelligently routes between Azure and Whisper
- Automatic failover logic:
  - **Primary**: Azure Speech (best accuracy, requires API key)
  - **Fallback**: Whisper (offline capability, works without API)
- Returns structured `SpeechRecognitionResult` with provider info
- Supports language preference override

#### 4. **Speech API Routes** (`backend/app/routers/speech.py`)

- `POST /api/v1/speech/transcribe` - Upload and transcribe audio files
- `POST /api/v1/speech/transcribe-bytes` - Send raw audio bytes
- `GET /api/v1/speech/status` - Check service availability
- Full OpenAPI/Swagger documentation

### Frontend (TypeScript/React)

#### 1. **Azure Speech Service** (`src/renderer/src/services/azureSpeech.ts`)

- Browser-based continuous speech recognition
- Azure Speech SDK integration (loaded from CDN)
- Features:
  - Microphone input handling
  - Automatic reconnection with exponential backoff
  - Event-driven callbacks (onRecognizing, onRecognized, onError)
  - Audio quality monitoring
  - Session persistence

#### 2. **React Hook** (`src/renderer/src/hooks/useAzureSpeech.ts`)

- `useAzureSpeech()` hook for easy component integration
- Manages:
  - Listening state and transcript entries
  - Partial/interim text during recognition
  - Language selection
  - Service status checking
- Methods provided:
  - `startListening()` / `stopListening()`
  - `clearTranscript()`
  - `getTranscriptText()`
  - `getServiceStatus()`

### Configuration

#### Backend Environment (`backend/env.example`)

```
AZURE_SPEECH_KEY=<your_azure_key>
AZURE_SPEECH_REGION=eastasia
AZURE_SPEECH_LANGUAGE=zh-TW
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_USE_FALLBACK=true
```

#### Frontend Environment (`src/renderer/.env.example`)

```
VITE_AZURE_SPEECH_KEY=<optional_frontend_key>
VITE_AZURE_SPEECH_REGION=eastasia
VITE_ENABLE_AZURE_SPEECH=true
VITE_ENABLE_LOCAL_SPEECH_FALLBACK=true
VITE_SPEECH_DEFAULT_LANGUAGE=zh-TW
```

### Dependencies Updated

**Backend** (`backend/requirements.txt`):

- `cognitive-services-speech==1.37.0` - Azure Speech SDK
- `openai-whisper==20240930` - Whisper model

**Frontend**:

- Azure Speech SDK via CDN (no npm package required)
- No additional frontend package dependencies

### Documentation

1. **SPEECH_INTEGRATION_GUIDE.md** - Complete setup and usage guide
2. **SPEECH_INTEGRATION_EXAMPLES.tsx** - Code examples for integration
3. **This Summary** - High-level overview

## Key Features

### 1. **Seamless Failover**

```
User speaks → Azure (primary)
    ↓ if fails
  Whisper (fallback)
    ↓ if fails
  Error to user
```

### 2. **Dual Integration Approaches**

**Option A: Frontend-Direct** (Browser-based)

```tsx
const speech = useAzureSpeech({ interviewId, language: 'zh-TW' })
await speech.startListening()
```

**Option B: Backend API** (Secure, Recommended for Production)

```tsx
const response = await fetch('/api/v1/speech/transcribe', {
  method: 'POST',
  body: formData // Contains audio file
})
```

### 3. **Service Status Monitoring**

```tsx
const status = await speech.getServiceStatus()
// Returns: azure_configured, whisper_enabled, primary_service, can_transcribe
```

### 4. **Confidence Scoring**

- Each transcribed entry includes confidence (0-1 scale)
- Can be used to filter low-confidence results
- Exported in transcript data for audit trail

### 5. **Multi-Language Support**

- Azure: Auto-detects or respects preferred language
- Whisper: Supports auto-detection via language parameter
- Currently configured for zh-TW (Traditional Chinese) by default

## Migration Path from Existing Implementation

### From Browser SpeechRecognition to Azure Speech

Current state supports browser's Web Speech API:

```tsx
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)()
```

New priority chain:

1. **Azure Speech** (if SDK loaded and configured)
2. **Browser SpeechRecognition** (legacy fallback)
3. **Backend API** (if neither above available)

### Recommended Integration Steps

1. **Deploy Backend Services**

   ```bash
   pip install -r backend/requirements.txt
   # Configure .env with Azure credentials
   # Restart backend server
   ```

2. **Update Frontend Configuration**

   ```bash
   # Copy .env.example to .env.local
   # Add Azure credentials (optional - backend API is more secure)
   ```

3. **Add Speech Component to Meeting Page**
   - Import `useAzureSpeech` hook
   - Add `SpeechRecognitionPanel` component
   - Reference: `SPEECH_INTEGRATION_EXAMPLES.tsx`

4. **Test**
   - Check `/api/v1/speech/status` endpoint
   - Test microphone permissions
   - Verify transcription with sample audio

## Performance Characteristics

### Azure Speech

- **Latency**: ~0.5-2 seconds per utterance
- **Accuracy**: 85-95% for clear audio
- **Cost**: $1 per hour
- **Network**: Requires internet connection
- **Model Size**: Server-side (no local storage)

### Whisper

- **Latency**: 5-30 seconds per minute of audio (CPU-dependent)
- **Accuracy**: 80-95% (varies by model)
- **Cost**: Free
- **Network**: Offline capable
- **Model Size**: 74MB (tiny) to 2.9GB (large)

## Security Considerations

### API Keys in Frontend (NOT RECOMMENDED)

```tsx
// ❌ Avoid: Keys exposed to browser
const response = await azureSpeechService.start({
  azureKey: process.env.VITE_AZURE_SPEECH_KEY,
  ...
});
```

### Backend Proxy (RECOMMENDED)

```tsx
// ✅ Better: Backend handles keys
const formData = new FormData()
formData.append('file', audioFile)
const result = await fetch('/api/v1/speech/transcribe', {
  method: 'POST',
  body: formData
})
```

### Key Management

- Store Azure keys in environment variables
- Use Azure Key Vault for production
- Rotate keys quarterly
- Never commit keys to version control

## Troubleshooting

### Common Issues

| Issue                | Cause                      | Solution                                               |
| -------------------- | -------------------------- | ------------------------------------------------------ |
| "SDK not loaded"     | Azure SDK script failed    | Check CDN in index.html, verify CSP settings           |
| "Quota exceeded"     | Azure subscription limit   | Check Azure dashboard, upgrade tier, or enable Whisper |
| "Slow transcription" | Whisper on CPU             | Switch to GPU (cuda), use smaller model (tiny/base)    |
| "Microphone denied"  | Permission denied          | Check browser/system permissions for mic access        |
| "No speech detected" | Silent or very quiet audio | Check mic levels, test with louder audio               |

### Verification Checklist

- [ ] Backend server running on port 8000
- [ ] `/api/v1/speech/status` returns available services
- [ ] Microphone permissions granted in browser
- [ ] Azure credentials configured (if using Azure)
- [ ] Whisper model downloaded (if using Whisper)
- [ ] Frontend index.html includes Azure Speech SDK script
- [ ] CSP headers allow Azure domains (\*.tts.speech.microsoft.com)

## Files Created/Modified

### New Files

- `backend/app/services/azure_speech.py`
- `backend/app/services/whisper.py`
- `backend/app/services/unified_speech.py`
- `backend/app/routers/speech.py`
- `src/renderer/src/services/azureSpeech.ts`
- `src/renderer/src/hooks/useAzureSpeech.ts`
- `src/renderer/.env.example`
- `SPEECH_INTEGRATION_GUIDE.md`
- `SPEECH_INTEGRATION_EXAMPLES.tsx`

### Modified Files

- `backend/app/core/config.py` - Added Azure/Whisper configuration
- `backend/env.example` - Added speech-related env variables
- `backend/requirements.txt` - Added cognitive-services-speech, openai-whisper
- `backend/app/main.py` - Registered speech router
- `src/renderer/index.html` - Added Azure SDK script, updated CSP

## Next Steps

### Immediate

1. Configure Azure Speech credentials in backend/.env
2. Restart backend server
3. Test `/api/v1/speech/status` endpoint
4. Verify Whisper model downloads on first use

### Short-term

1. Integrate `useAzureSpeech` hook into meeting page
2. Test transcription with team
3. Gather feedback on accuracy and latency

### Medium-term

1. Implement transcript persistence to database
2. Add transcript search and filtering
3. Create analytics dashboard for transcription quality
4. Consider GPU deployment for Whisper (if using)

### Long-term

1. Fine-tune Whisper model for domain-specific terms (interview Q&A)
2. Implement speaker diarization (who said what)
3. Extract entities (candidate skills, requirements met)
4. Integrate with AI analysis pipeline

## References

- [Azure Speech Documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/)
- [Azure Speech SDK - JavaScript](https://docs.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/)
- [OpenAI Whisper GitHub](https://github.com/openai/whisper)
- [Whisper Models](https://github.com/openai/whisper/blob/main/README.md#available-models-and-languages)

## Support

For questions or issues:

1. Check `SPEECH_INTEGRATION_GUIDE.md` for detailed setup
2. Review `SPEECH_INTEGRATION_EXAMPLES.tsx` for code examples
3. Check server logs: `backend/app/main.py` should log service status
4. Verify environment variables are set correctly
5. Test backend endpoint: `curl http://localhost:8000/api/v1/speech/status`

---

**Implementation Date**: March 2026
**Status**: ✅ Complete and Ready for Integration
