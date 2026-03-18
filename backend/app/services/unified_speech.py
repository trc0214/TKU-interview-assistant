"""
Unified Speech-to-Text Service

Provides a single interface for speech recognition with automatic fallback:
1. Primary: Azure Speech-to-Text (cloud-based, higher accuracy)
2. Fallback: OpenAI Whisper (local, works offline, no quota limits)
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.azure_speech import get_azure_speech_service
from app.services.whisper import get_whisper_service

logger = logging.getLogger(__name__)


class SpeechRecognitionResult:
    """Structured result from speech recognition"""

    def __init__(
        self,
        text: str,
        language: str,
        confidence: float,
        provider: str,
        used_fallback: bool,
        words: list[dict[str, Any]] | None = None,
        segments: list[dict[str, Any]] | None = None,
        error: str | None = None,
        raw_data: dict[str, Any] | None = None,
    ):
        self.text = text
        self.language = language
        self.confidence = confidence
        self.provider = provider  # 'azure' or 'whisper'
        self.used_fallback = used_fallback
        self.words = words or []
        self.segments = segments or []
        self.error = error
        self.raw_data = raw_data or {}

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return {
            "text": self.text,
            "language": self.language,
            "confidence": min(1.0, max(0.0, self.confidence)),
            "provider": self.provider,
            "used_fallback": self.used_fallback,
            "words": self.words,
            "segments": self.segments,
            "error": self.error,
        }


class UnifiedSpeechService:
    """Unified speech recognition service with fallback support"""

    def __init__(self):
        self.azure_service = get_azure_speech_service()
        self.whisper_service = get_whisper_service()

    async def transcribe(
        self,
        audio_data: bytes,
        language: str | None = None,
        prefer_local: bool = False,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> SpeechRecognitionResult:
        """
        Transcribe audio to text with automatic fallback.

        Args:
            audio_data: Raw audio bytes
            language: Optional language code (e.g., 'zh-TW', 'en-US')
            prefer_local: If True, try Whisper first before Azure

        Returns:
            SpeechRecognitionResult with transcription data
        """
        if not audio_data:
            return SpeechRecognitionResult(
                text="",
                language=language or "unknown",
                confidence=0,
                provider="none",
                used_fallback=False,
                error="Empty audio data provided",
            )

        # Try preferred service first
        if prefer_local and self.whisper_service.is_enabled():
            result = await self._try_whisper(audio_data, language, filename=filename, content_type=content_type)
            if result.text and not result.error:
                return result
            # Fall through to Azure if Whisper failed

        # Try Azure
        if self.azure_service.is_configured():
            result = await self._try_azure(audio_data, language, filename=filename, content_type=content_type)
            if result.text and not result.error:
                return result
            if self._is_no_speech_result(result):
                return result
            # Fall through to Whisper if Azure failed
            logger.warning("Azure Speech failed, attempting Whisper fallback")

        # Try Whisper as fallback
        if self.whisper_service.is_enabled():
            result = await self._try_whisper(audio_data, language, filename=filename, content_type=content_type)
            result.used_fallback = True
            return result

        # No service available
        return SpeechRecognitionResult(
            text="",
            language=language or "unknown",
            confidence=0,
            provider="none",
            used_fallback=False,
            error="No speech recognition services available (Azure and Whisper not configured)",
        )

    @staticmethod
    def _is_no_speech_result(result: SpeechRecognitionResult) -> bool:
        if not result.error:
            return False

        normalized_error = result.error.strip().lower()
        return 'no speech detected' in normalized_error

    async def _try_azure(
        self,
        audio_data: bytes,
        language: str | None = None,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> SpeechRecognitionResult:
        """Try to transcribe using Azure Speech"""
        try:
            result_dict = await self.azure_service.transcribe_audio_bytes(
                audio_data,
                language=language,
                filename=filename,
                content_type=content_type,
            )

            if result_dict.get("error"):
                logger.warning(f"Azure Speech error: {result_dict['error']}")

            return SpeechRecognitionResult(
                text=result_dict.get("text", ""),
                language=result_dict.get("language", language or "unknown"),
                confidence=result_dict.get("confidence", 0),
                provider="azure",
                used_fallback=False,
                words=result_dict.get("words", []),
                error=result_dict.get("error"),
                raw_data=result_dict.get("raw_json", {}),
            )
        except Exception as error:
            logger.exception("Azure Speech service error")
            return SpeechRecognitionResult(
                text="",
                language=language or "unknown",
                confidence=0,
                provider="azure",
                used_fallback=False,
                error=f"Azure service error: {str(error)}",
            )

    async def _try_whisper(
        self,
        audio_data: bytes,
        language: str | None = None,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> SpeechRecognitionResult:
        """Try to transcribe using Whisper"""
        try:
            result_dict = await self.whisper_service.transcribe_audio_bytes(
                audio_data,
                language=language,
                filename=filename,
                content_type=content_type,
            )

            if result_dict.get("error"):
                logger.warning(f"Whisper error: {result_dict['error']}")

            return SpeechRecognitionResult(
                text=result_dict.get("text", ""),
                language=result_dict.get("language", language or "unknown"),
                confidence=result_dict.get("confidence", 0),
                provider="whisper",
                used_fallback=False,
                segments=result_dict.get("segments", []),
                error=result_dict.get("error"),
                raw_data=result_dict.get("raw_output", {}),
            )
        except Exception as error:
            logger.exception("Whisper service error")
            return SpeechRecognitionResult(
                text="",
                language=language or "unknown",
                confidence=0,
                provider="whisper",
                used_fallback=False,
                error=f"Whisper service error: {str(error)}",
            )

    def get_service_status(self) -> dict[str, Any]:
        """Get status of available speech services"""
        return {
            "azure_configured": self.azure_service.is_configured(),
            "whisper_enabled": self.whisper_service.is_enabled(),
            "primary_service": "azure" if self.azure_service.is_configured() else "whisper" if self.whisper_service.is_enabled() else "none",
            "can_transcribe": self.azure_service.is_configured() or self.whisper_service.is_enabled(),
        }


# Global instance
_unified_service: UnifiedSpeechService | None = None


def get_speech_service() -> UnifiedSpeechService:
    """Get or create the global unified speech service instance"""
    global _unified_service
    if _unified_service is None:
        _unified_service = UnifiedSpeechService()
    return _unified_service
