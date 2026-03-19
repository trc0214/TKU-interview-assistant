"""
Azure Speech-to-Text Service

Provides speech recognition capabilities using Microsoft Azure Cognitive Services.
Supports both streaming audio and bulk file transcription.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
from typing import Any

try:
    import azure.cognitiveservices.speech as speechsdk  # type: ignore[import-not-found]
except ModuleNotFoundError:
    speechsdk = None

from app.core.config import settings

logger = logging.getLogger(__name__)


class AzureSpeechService:
    """Azure Speech-to-Text recognition service"""

    def __init__(self):
        self.key = settings.azure_speech_key
        self.region = settings.azure_speech_region
        self.language = settings.azure_speech_language

        if not self.key or not self.region:
            logger.warning("Azure Speech credentials not configured")
        if speechsdk is None:
            logger.warning("Azure Speech SDK not installed; Azure transcription disabled")

    def is_configured(self) -> bool:
        """Check if Azure Speech service is properly configured"""
        return bool(self.key and self.region and speechsdk is not None)

    @staticmethod
    def _sdk() -> Any:
        if speechsdk is None:
            raise RuntimeError("Azure Speech SDK is not installed")
        return speechsdk

    def get_speech_config(self) -> Any:
        """Create and return a configured SpeechConfig object"""
        if not self.is_configured():
            return None

        sdk = self._sdk()

        speech_config = sdk.SpeechConfig(
            subscription=self.key,
            region=self.region,
        )
        speech_config.speech_recognition_language = self.language

        # Enable detailed output with timing information
        speech_config.output_format = sdk.OutputFormat.Detailed
        speech_config.set_property(
            sdk.PropertyId.SpeechServiceResponse_RequestWordLevelTimestamps,
            "true",
        )
        speech_config.set_property(
            sdk.PropertyId.SpeechServiceResponse_PostProcessingOption,
            "TrueText",
        )

        return speech_config

    async def transcribe_audio_bytes(
        self,
        audio_data: bytes,
        language: str | None = None,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        """
        Transcribe audio data (bytes) to text.

        Args:
            audio_data: Raw audio bytes (WAV format recommended)
            language: Optional language code override (e.g., 'zh-TW', 'en-US')

        Returns:
            Dictionary with keys:
            - text: Recognized text
            - language: Detected/used language
            - confidence: Confidence score (0-1)
            - words: List of word-level results with timing
            - raw_json: Full Azure response
            - error: Error message if transcription failed
        """
        if not self.is_configured():
            return {
                "text": "",
                "language": language or self.language,
                "confidence": 0,
                "words": [],
                "raw_json": {},
                "error": "Azure Speech service not configured",
            }

        try:
            sdk = self._sdk()
            speech_config = self.get_speech_config()
            if language:
                speech_config.speech_recognition_language = language

            pcm_audio = self._decode_to_pcm16_mono_16k(audio_data)
            if not pcm_audio:
                pcm_audio = self._decode_to_pcm16_mono_16k(
                    audio_data,
                    filename=filename,
                    content_type=content_type,
                )
            if not pcm_audio:
                return {
                    "text": "",
                    "language": language or self.language,
                    "confidence": 0,
                    "words": [],
                    "raw_json": {},
                    "error": "Unable to decode audio payload (unsupported/partial chunk).",
                }

            # Create audio config from bytes
            audio_stream = sdk.audio.PushAudioInputStream(
                stream_format=sdk.audio.AudioStreamFormat(
                    samples_per_second=16000,
                    bits_per_sample=16,
                    channels=1,
                )
            )

            # Write audio data
            audio_stream.write(pcm_audio)
            audio_stream.close()

            audio_config = sdk.audio.AudioConfig(stream=audio_stream)
            recognizer = sdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
            )

            # Perform recognition
            result = await asyncio.to_thread(recognizer.recognize_once)

            if result.reason == sdk.ResultReason.RecognizedSpeech:
                words = self._extract_words_from_json(result.json)
                return {
                    "text": result.text,
                    "language": language or self.language,
                    "confidence": self._calculate_confidence(result),
                    "words": words,
                    "raw_json": result.json,
                    "error": None,
                }
            elif result.reason == sdk.ResultReason.NoMatch:
                return {
                    "text": "",
                    "language": language or self.language,
                    "confidence": 0,
                    "words": [],
                    "raw_json": {},
                    "error": "No speech detected in audio",
                }
            else:
                error_msg = result.error_details if result.reason == sdk.ResultReason.Canceled else "Unknown error"
                return {
                    "text": "",
                    "language": language or self.language,
                    "confidence": 0,
                    "words": [],
                    "raw_json": {},
                    "error": str(error_msg),
                }

        except Exception as error:
            logger.exception("Azure Speech transcription error")
            return {
                "text": "",
                "language": language or self.language,
                "confidence": 0,
                "words": [],
                "raw_json": {},
                "error": f"Transcription failed: {str(error)}",
            }

    @staticmethod
    def _decode_to_pcm16_mono_16k(
        audio_data: bytes,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> bytes | None:
        def infer_format() -> str | None:
            normalized_type = (content_type or '').lower()
            if 'webm' in normalized_type:
                return 'webm'
            if 'ogg' in normalized_type:
                return 'ogg'
            if 'mp4' in normalized_type or 'm4a' in normalized_type:
                return 'mp4'
            if 'wav' in normalized_type:
                return 'wav'

            lower_name = (filename or '').lower()
            if lower_name.endswith('.webm'):
                return 'webm'
            if lower_name.endswith('.ogg'):
                return 'ogg'
            if lower_name.endswith('.mp4') or lower_name.endswith('.m4a'):
                return 'mp4'
            if lower_name.endswith('.wav'):
                return 'wav'

            return None

        def run_ffmpeg(input_args: list[str]) -> tuple[int, bytes, str]:
            process = subprocess.run(
                [
                    'ffmpeg',
                    '-hide_banner',
                    '-loglevel',
                    'error',
                    *input_args,
                    '-f',
                    's16le',
                    '-acodec',
                    'pcm_s16le',
                    '-ac',
                    '1',
                    '-ar',
                    '16000',
                    'pipe:1',
                ],
                input=audio_data,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            return process.returncode, process.stdout, process.stderr.decode(errors='ignore').strip()

        try:
            code, output, error = run_ffmpeg(['-i', 'pipe:0'])
            if code == 0 and output:
                return output

            forced_format = infer_format()
            if forced_format:
                code, output, forced_error = run_ffmpeg(['-f', forced_format, '-i', 'pipe:0'])
                if code == 0 and output:
                    return output
                logger.warning('ffmpeg decode failed (auto + forced %s): %s | %s', forced_format, error, forced_error)
            else:
                logger.warning('ffmpeg decode failed: %s', error)

            return None
        except FileNotFoundError:
            logger.error("ffmpeg not found; cannot decode uploaded audio bytes")
            return None
        except Exception as error:
            logger.warning("Failed to decode audio bytes: %s", error)
            return None

    @staticmethod
    def _calculate_confidence(result: Any) -> float:
        """Calculate confidence score from Azure result"""
        try:
            if hasattr(result, "json") and result.json:
                # Parse JSON response to extract confidence
                import json

                data = json.loads(result.json)
                # Confidence is typically in NBest[0].Confidence
                if "NBest" in data and len(data["NBest"]) > 0:
                    return float(data["NBest"][0].get("Confidence", 0))
        except Exception:
            pass
        return 0.5  # Default to moderate confidence

    @staticmethod
    def _extract_words_from_json(json_result: str) -> list[dict[str, Any]]:
        """Extract word-level timing and confidence from Azure JSON response"""
        try:
            import json

            data = json.loads(json_result)
            words = []

            if "NBest" in data and len(data["NBest"]) > 0:
                best = data["NBest"][0]
                if "Words" in best:
                    for word_data in best["Words"]:
                        words.append(
                            {
                                "word": word_data.get("Word", ""),
                                "offset": word_data.get("Offset", 0),
                                "duration": word_data.get("Duration", 0),
                                "confidence": word_data.get("Confidence", 0),
                            }
                        )

            return words
        except Exception:
            return []


# Global instance
_azure_speech_service: AzureSpeechService | None = None


def get_azure_speech_service() -> AzureSpeechService:
    """Get or create the global Azure Speech service instance"""
    global _azure_speech_service
    if _azure_speech_service is None:
        _azure_speech_service = AzureSpeechService()
    return _azure_speech_service
