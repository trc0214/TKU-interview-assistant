"""
Speech-to-Text API Routes

Endpoints for speech recognition and transcription:
- POST /speech/transcribe - Transcribe audio bytes
- GET /speech/status - Get speech service status
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.unified_speech import get_speech_service

router = APIRouter(prefix="/speech", tags=["speech"])


class TranscriptResult(BaseModel):
    """Speech transcription result"""

    text: str = Field(..., description="Recognized text")
    language: str = Field(..., description="Language code")
    confidence: float = Field(..., ge=0, le=1, description="Confidence score 0-1")
    provider: str = Field(..., description="Provider used: 'azure' or 'whisper'")
    used_fallback: bool = Field(..., description="Whether fallback was used")
    error: str | None = Field(None, description="Error message if transcription failed")


class SpeechServiceStatus(BaseModel):
    """Speech service status information"""

    azure_configured: bool = Field(..., description="Azure Speech is configured")
    whisper_enabled: bool = Field(..., description="Whisper fallback is enabled")
    primary_service: str = Field(..., description="Primary service: 'azure', 'whisper', or 'none'")
    can_transcribe: bool = Field(..., description="At least one service is available")


@router.post("/transcribe", response_model=TranscriptResult)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str | None = None,
    prefer_local: bool = False,
) -> TranscriptResult:
    """
    Transcribe audio file to text.

    Attempts Azure Speech first (if configured), falls back to Whisper if needed.

    **Parameters:**
    - `file`: Audio file (WAV, MP3, etc.)
    - `language`: Optional language code (e.g., 'zh-TW', 'en-US')
    - `prefer_local`: Try Whisper first if True

    **Returns:**
    - Text: Recognized text
    - Language: Language used for recognition
    - Confidence: Confidence score (0-1)
    - Provider: Which service performed transcription
    - Used Fallback: Whether fallback was needed
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")

    try:
        # Read audio file
        audio_data = await file.read()
        if not audio_data:
            raise HTTPException(status_code=400, detail="File is empty")

        # Transcribe
        service = get_speech_service()
        result = await service.transcribe(
            audio_data=audio_data,
            language=language,
            prefer_local=prefer_local,
            filename=file.filename,
            content_type=file.content_type,
        )

        return TranscriptResult(
            text=result.text,
            language=result.language,
            confidence=result.confidence,
            provider=result.provider,
            used_fallback=result.used_fallback,
            error=result.error,
        )

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Audio processing error: {str(error)}",
        ) from error


@router.post("/transcribe-bytes", response_model=TranscriptResult)
async def transcribe_audio_bytes(
    audio_data: bytes = File(...),
    language: str | None = None,
    prefer_local: bool = False,
) -> TranscriptResult:
    """
    Transcribe raw audio bytes to text.

    **Parameters:**
    - `audio_data`: Raw audio bytes
    - `language`: Optional language code (e.g., 'zh-TW', 'en-US')
    - `prefer_local`: Try Whisper first if True

    **Returns:**
    - Text: Recognized text
    - Language: Language used for recognition
    - Confidence: Confidence score (0-1)
    - Provider: Which service performed transcription
    - Used Fallback: Whether fallback was needed
    """
    if not audio_data:
        raise HTTPException(status_code=400, detail="No audio data provided")

    try:
        service = get_speech_service()
        result = await service.transcribe(
            audio_data=audio_data,
            language=language,
            prefer_local=prefer_local,
            filename=None,
            content_type=None,
        )

        return TranscriptResult(
            text=result.text,
            language=result.language,
            confidence=result.confidence,
            provider=result.provider,
            used_fallback=result.used_fallback,
            error=result.error,
        )

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Audio processing error: {str(error)}",
        ) from error


@router.get("/status", response_model=SpeechServiceStatus)
async def get_service_status() -> SpeechServiceStatus:
    """
    Get current speech recognition service status.

    **Returns:**
    - azure_configured: Whether Azure Speech is properly configured
    - whisper_enabled: Whether Whisper fallback is enabled
    - primary_service: Which service is primary: 'azure', 'whisper', or 'none'
    - can_transcribe: Whether transcription is available
    """
    service = get_speech_service()
    status = service.get_service_status()

    return SpeechServiceStatus(
        azure_configured=status["azure_configured"],
        whisper_enabled=status["whisper_enabled"],
        primary_service=status["primary_service"],
        can_transcribe=status["can_transcribe"],
    )
