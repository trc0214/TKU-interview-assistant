# Quick Reference: Azure Speech + Whisper Implementation

## Installation & Setup

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
# Configure .env with Azure credentials
python -m uvicorn app.main:app --port 8000
```

### Environment Variables

**backend/.env (required for Azure)**

```env
AZURE_SPEECH_KEY=your_key_here
AZURE_SPEECH_REGION=eastasia
AZURE_SPEECH_LANGUAGE=zh-TW
WHISPER_USE_FALLBACK=true
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
```

**src/renderer/.env.local (optional, not recommended for production)**

```env
VITE_AZURE_SPEECH_REGION=eastasia
VITE_ENABLE_AZURE_SPEECH=true
```

## API Endpoints

### Check Service Status

```bash
curl http://localhost:8000/api/v1/speech/status
```

### Transcribe Audio File

```bash
curl -X POST -F "file=@audio.wav" -F "language=zh-TW" \
     http://localhost:8000/api/v1/speech/transcribe
```

### Response Example

```json
{
  "text": "您好，我是候選人",
  "language": "zh-TW",
  "confidence": 0.92,
  "provider": "azure",
  "used_fallback": false,
  "error": null
}
```

## Frontend Usage

### React Hook

```typescript
import { useAzureSpeech } from '@/hooks/useAzureSpeech';

function MyComponent() {
  const speech = useAzureSpeech({
    interviewId: 123,
    language: 'zh-TW'
  });

  return (
    <>
      <button onClick={() => speech.startListening()}>
        Start
      </button>
      <button onClick={() => speech.stopListening()}>
        Stop
      </button>
      <div>{speech.getTranscriptText()}</div>
    </>
  );
}
```

### Component Integration

```typescript
import SpeechRecognitionPanel from 'SPEECH_INTEGRATION_EXAMPLES.tsx';

export function MeetingPage() {
  return (
    <div>
      {/* ... existing UI ... */}
      <SpeechRecognitionPanel interviewId={123} />
    </div>
  );
}
```

## Service Fallback Chain

```
Azure Speech (Cloud)
  ↓ [if unavailable or fails]
Whisper (Local)
  ↓ [if both fail]
Error Message to User
```

## File Structure

```
backend/
  app/
    services/
      azure_speech.py       ← Azure Speech SDK wrapper
      whisper.py            ← Whisper model wrapper
      unified_speech.py     ← Orchestrator (primary+fallback)
    routers/
      speech.py             ← API endpoints
    core/
      config.py             ← Configuration (updated)
    main.py                 ← App setup (updated)
  env.example               ← Configuration template
  requirements.txt          ← Dependencies (updated)

src/renderer/
  src/
    services/
      azureSpeech.ts        ← Frontend Azure Speech service
    hooks/
      useAzureSpeech.ts     ← React hook
    pages/
      meeting/
        meeting.tsx         ← [TODO: Integrate component]
  index.html                ← HTML template (updated with SDK)
  .env.example              ← Frontend config
```

## Workflow Comparison

### Before (SpeechRecognition API)

```
Browser SpeechRecognition
  ↓ (limited features, no fallback)
Manual transcription or nothing
```

### After (Azure + Whisper)

```
┌─ Azure Speech (Cloud)
├─ Whisper (Local Fallback)
└─ Auto-failover on errors
```

## Performance Tips

### Reduce Latency

1. Use "base" Whisper model (not "large")
2. Deploy in same region as users (Azure)
3. Enable GPU (cuda) for Whisper if available

### Reduce Memory

1. Use "tiny" Whisper model (74MB, 4GB RAM)
2. Unload model when not needed: `service.unload_model()`
3. Process audio in chunks

### Reduce Costs (if using Azure)

1. Set up Whisper fallback for high-volume scenarios
2. Use region-specific Azure endpoints
3. Monitor quota usage in Azure Portal

## Debugging

### Check Backend Availability

```bash
# Service status
curl http://localhost:8000/api/v1/speech/status | jq

# Backend logs
# Should show: "Azure Speech configured: True/False"
# Should show: "Whisper enabled: True/False"
```

### Check Frontend

```javascript
// In browser console
window.SpeechSDK // Should be defined
// If undefined, Azure SDK CDN script failed to load
```

### Test Transcription

```python
# In backend Python shell
from app.services.unified_speech import get_speech_service
service = get_speech_service()

# Test status
print(service.get_service_status())

# Test with sample audio
with open('sample.wav', 'rb') as f:
    result = await service.transcribe(f.read())
    print(result.to_dict())
```

## Common Problems

### "Azure Speech SDK not loaded"

- Check: `<script src="https://aka.ms/csspeech/jsbrowserpackageraw"></script>` in index.html
- Check: CSP allows https://aka.ms

### "Microphone permission denied"

- Grant in browser: Settings → Privacy → Microphone
- Grant in OS: System Settings → Privacy & Security → Microphone

### "Quota exceeded"

- Check Azure subscription (Azure Portal)
- Enable Whisper fallback
- Implement rate limiting

### "No transcription results"

- Check language code (e.g., 'zh-TW' not 'Chinese')
- Check audio quality (clear speech works better)
- Check backend logs for errors

## Tips for Integration

1. **Keep existing SpeechRecognition as fallback** for robustness
2. **Use backend API** (Option B) for production security
3. **Test with various audio qualities** before deployment
4. **Monitor confidence scores** to detect issues early
5. **Implement graceful degradation** if services unavailable

## Key URLs

- Azure Portal: https://portal.azure.com
- Whisper GitHub: https://github.com/openai/whisper
- Azure Speech Docs: https://docs.microsoft.com/en-us/azure/ai-services/speech-service/
- Azure SDK Docs: https://docs.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/

## Next Integration Steps

1. ✅ Backend implementation complete
2. ✅ Frontend services created
3. ⏳ Integrate component into meeting page
4. ⏳ Test with real audio
5. ⏳ Deploy and monitor

---

**Last Updated**: March 2026
**Status**: Ready for integration into meeting page
