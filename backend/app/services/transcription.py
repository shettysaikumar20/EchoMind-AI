import math
import struct
import time
import logging
import io
from typing import Optional, Dict, Any, List
import numpy as np
from app.core.config import settings

logger = logging.getLogger("echomind.stt")

_whisper_model = None

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            logger.info("Initializing faster-whisper tiny.en model on CPU (int8)...")
            _whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
            logger.info("faster-whisper model ready for real-time transcription.")
        except Exception as e:
            logger.warning(f"faster-whisper initialization skipped/failed: {e}")
            _whisper_model = False
    return _whisper_model if _whisper_model is not False else None


class AudioTranscriber:
    """
    Speech-to-text service adapter.
    Handles real audio chunk ingestion, Voice Activity Detection (VAD),
    and local offline faster-whisper speech recognition with timestamps and source labeling.
    """
    def __init__(self, mode: Optional[str] = None):
        self.mode = mode or settings.STT_MODE
        self.session_buffers: Dict[str, bytearray] = {}
        self.session_start_times: Dict[str, float] = {}
        self.session_init_epoch: Dict[str, float] = {}
        self.last_speech_time: Dict[str, float] = {}
        self.sample_rate = 16000

    def calculate_rms(self, pcm_data: bytes) -> float:
        """Calculate Root Mean Square (RMS) amplitude from 16-bit PCM bytes."""
        if len(pcm_data) < 2:
            return 0.0
        count = len(pcm_data) // 2
        try:
            shorts = struct.unpack(f"<{count}h", pcm_data[:count * 2])
            sum_squares = sum(s * s for s in shorts)
            rms = math.sqrt(sum_squares / count)
            return min(1.0, rms / 32768.0)
        except Exception:
            return 0.0

    def pcm_to_float32(self, pcm_bytes: bytes) -> np.ndarray:
        """Converts 16-bit PCM bytes to normalized float32 numpy array."""
        count = len(pcm_bytes) // 2
        if count == 0:
            return np.array([], dtype=np.float32)
        shorts = np.frombuffer(pcm_bytes[:count * 2], dtype=np.int16)
        return shorts.astype(np.float32) / 32768.0

    def process_audio_chunk(
        self,
        session_id: str,
        audio_bytes: bytes,
        source: str = "mic",
        timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Ingest audio chunk, calculate RMS audio telemetry,
        and perform real speech-to-text transcription if speech is present.
        """
        now = timestamp or time.time()
        rms = self.calculate_rms(audio_bytes)

        if session_id not in self.session_init_epoch:
            self.session_init_epoch[session_id] = now

        if session_id not in self.session_buffers:
            self.session_buffers[session_id] = bytearray()
            self.session_start_times[session_id] = now
            self.last_speech_time[session_id] = now

        self.session_buffers[session_id].extend(audio_bytes)
        buffer_len = len(self.session_buffers[session_id])

        result: Dict[str, Any] = {
            "type": "audio_telemetry",
            "source": source,
            "rms": round(rms, 4),
            "timestamp": now,
        }

        # Check if voice activity detected (sensitive conversational threshold)
        if rms > 0.008:
            self.last_speech_time[session_id] = now

        # Thresholds: buffer size >= 3.5 seconds of 16kHz 16-bit PCM
        # OR speech ended (silence gap > 0.8s and buffer has >= 0.8s of audio)
        bytes_for_1s = self.sample_rate * 2
        bytes_for_3_5s = int(bytes_for_1s * 3.5)
        silence_gap = now - self.last_speech_time.get(session_id, now)

        should_transcribe = False
        if buffer_len >= bytes_for_3_5s:
            should_transcribe = True
        elif buffer_len >= int(bytes_for_1s * 0.8) and silence_gap > 0.8:
            should_transcribe = True

        if should_transcribe:
            transcription = self.finalize_buffer(session_id, source=source)
            if transcription and transcription.get("text"):
                result["transcript"] = transcription

        return result

    def finalize_buffer(self, session_id: str, source: str = "mic") -> Optional[Dict[str, Any]]:
        """Flushes remaining audio for a session and runs faster-whisper transcription."""
        buf = self.session_buffers.pop(session_id, None)
        now = time.time()
        start_epoch = self.session_start_times.pop(session_id, now)
        init_epoch = self.session_init_epoch.get(session_id, start_epoch)
        rel_start = max(0.0, round(start_epoch - init_epoch, 1))
        rel_end = max(rel_start + 0.5, round(now - init_epoch, 1))

        if not buf or len(buf) < (self.sample_rate):  # at least ~0.5s of audio
            return None

        # Try faster-whisper model
        model = get_whisper_model()
        if not model:
            return None

        try:
            audio_array = self.pcm_to_float32(bytes(buf))
            if len(audio_array) == 0:
                return None

            segments, info = model.transcribe(
                audio_array,
                beam_size=1,
                language="en",
                condition_on_previous_text=False,
                vad_filter=False,  # Avoid dropping short utterances
            )

            text_parts = [s.text.strip() for s in segments if s.text.strip()]
            full_text = " ".join(text_parts).strip()

            if full_text:
                return {
                    "text": full_text,
                    "source": source,
                    "is_final": True,
                    "start_time": rel_start,
                    "end_time": rel_end,
                    "language": info.language,
                }
        except Exception as e:
            logger.error(f"Error during faster-whisper transcription: {e}")

        return None


# Global instance
transcriber = AudioTranscriber()
