"""
OpenAI Whisper Speech Recognition Service

Provides local speech recognition using OpenAI's Whisper model.
Used as a fallback when Azure Speech service is unavailable or for offline processing.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Any

try:
    import whisper
except ModuleNotFoundError:
    whisper = None

from app.core.config import settings

logger = logging.getLogger(__name__)


class WhisperService:
    """Local speech recognition using OpenAI Whisper model"""

    def __init__(self):
        self.model_name = settings.whisper_model
        self.device = settings.whisper_device
        self.use_fallback = settings.whisper_use_fallback
        self.model = None
        if whisper is None:
            logger.warning("openai-whisper is not installed; Whisper fallback disabled")

    def is_enabled(self) -> bool:
        """Check if Whisper fallback is enabled"""
        return self.use_fallback and whisper is not None

    def load_model(self) -> bool:
        """Load Whisper model into memory"""
        if self.model is not None:
            return True

        try:
            logger.info(f"Loading Whisper model: {self.model_name} on {self.device}")
            self.model = whisper.load_model(
                self.model_name,
                device=self.device,
            )
            return True
        except Exception as error:
            logger.error(f"Failed to load Whisper model: {error}")
            return False

    async def transcribe_audio_bytes(
        self,
        audio_data: bytes,
        language: str | None = None,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        """
        Transcribe audio data (bytes) to text using Whisper.

        Args:
            audio_data: Raw audio bytes (supports various formats)
            language: Optional language code (e.g., 'zh', 'en')

        Returns:
            Dictionary with keys:
            - text: Recognized text
            - language: Detected language
            - confidence: Confidence score (0-1)
            - segments: List of segment-level results
            - raw_output: Full Whisper output dict
            - error: Error message if transcription failed
        """
        if not self.is_enabled():
            return {
                "text": "",
                "language": language or "unknown",
                "confidence": 0,
                "segments": [],
                "raw_output": {},
                "error": "Whisper service is disabled",
            }

        try:
            # Load model if not already loaded
            if not self.load_model():
                return {
                    "text": "",
                    "language": language or "unknown",
                    "confidence": 0,
                    "segments": [],
                    "raw_output": {},
                    "error": "Failed to load Whisper model",
                }

            # Convert bytes to audio format Whisper can handle
            audio = self._load_audio_from_bytes(
                audio_data,
                suffix=self._resolve_audio_suffix(filename=filename, content_type=content_type),
            )

            if audio is None:
                return {
                    "text": "",
                    "language": language or "unknown",
                    "confidence": 0,
                    "segments": [],
                    "raw_output": {},
                    "error": f"Failed to load audio data (size={len(audio_data)} bytes)",
                }

            # Transcribe
            whisper_language = self._normalize_language(language)
            options: dict[str, Any] = {
                "language": whisper_language,  # Will auto-detect if None
                "task": "transcribe",
                "verbose": False,
            }

            result = self.model.transcribe(audio, **options)

            # Extract segments with confidence
            segments = self._extract_segment_info(result.get("segments", []))
            detected_language = result.get("language", language or "unknown")

            return {
                "text": result.get("text", "").strip(),
                "language": detected_language,
                "confidence": self._calculate_average_confidence(segments),
                "segments": segments,
                "raw_output": result,
                "error": None,
            }

        except Exception as error:
            logger.exception("Whisper transcription error")
            return {
                "text": "",
                "language": language or "unknown",
                "confidence": 0,
                "segments": [],
                "raw_output": {},
                "error": f"Transcription failed: {str(error)}",
            }

    @staticmethod
    def _load_audio_from_bytes(audio_data: bytes, suffix: str) -> Any:
        """Load audio bytes via Whisper's ffmpeg-backed loader."""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
                temporary_file.write(audio_data)
                temporary_file.flush()
                temp_path = temporary_file.name

            try:
                return whisper.load_audio(temp_path)
            finally:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

        except Exception as error:
            logger.error(f"Failed to load audio bytes: {error}")
            return None

    @staticmethod
    def _resolve_audio_suffix(filename: str | None, content_type: str | None) -> str:
        if filename:
            ext = Path(filename).suffix.strip().lower()
            if ext:
                return ext

        normalized_type = (content_type or '').lower()
        if 'webm' in normalized_type:
            return '.webm'
        if 'ogg' in normalized_type:
            return '.ogg'
        if 'mp4' in normalized_type or 'm4a' in normalized_type:
            return '.mp4'
        if 'wav' in normalized_type:
            return '.wav'

        return '.webm'

    @staticmethod
    def _normalize_language(language: str | None) -> str | None:
        if not language:
            return None

        normalized = language.strip().lower()
        if not normalized:
            return None

        if '-' in normalized:
            normalized = normalized.split('-', 1)[0]

        if '_' in normalized:
            normalized = normalized.split('_', 1)[0]

        return normalized or None

    @staticmethod
    def _extract_segment_info(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Extract relevant information from Whisper segments"""
        result = []
        for segment in segments:
            result.append(
                {
                    "id": segment.get("id"),
                    "start": segment.get("start", 0),
                    "end": segment.get("end", 0),
                    "text": segment.get("text", "").strip(),
                    "confidence": segment.get("confidence", 0),
                    "no_speech_prob": segment.get("no_speech_prob", 0),
                }
            )
        return result

    @staticmethod
    def _calculate_average_confidence(segments: list[dict[str, Any]]) -> float:
        """Calculate average confidence from segments"""
        if not segments:
            return 0

        confidences = [s.get("confidence", 0) for s in segments if s.get("confidence")]
        if not confidences:
            return 0

        return sum(confidences) / len(confidences)

    def unload_model(self) -> None:
        """Unload model from memory to free resources"""
        if self.model is not None:
            del self.model
            self.model = None
            logger.info("Whisper model unloaded")


# Global instance
_whisper_service: WhisperService | None = None


def get_whisper_service() -> WhisperService:
    """Get or create the global Whisper service instance"""
    global _whisper_service
    if _whisper_service is None:
        _whisper_service = WhisperService()
    return _whisper_service
