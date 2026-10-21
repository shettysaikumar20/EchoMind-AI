import math
import struct
import time
import logging
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger("echomind.stt")


class AudioTranscriber:
    """
    Speech-to-text service adapter.
    Handles audio chunk ingestion, Voice Activity Detection (VAD),
    and transcript generation with timestamps and source labeling.
    """
    def __init__(self, mode: Optional[str] = None):
        self.mode = mode or settings.STT_MODE
        self.session_buffers: Dict[str, bytearray] = {}
        self.last_audio_time: Dict[str, float] = {}

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

    def process_audio_chunk(
        self,
        session_id: str,
        audio_bytes: bytes,
        source: str = "mic",
        timestamp: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Ingest audio chunk, perform voice activity analysis,
        and yield transcript events.
        """
        now = timestamp or time.time()
        rms = self.calculate_rms(audio_bytes)

        if session_id not in self.session_buffers:
            self.session_buffers[session_id] = bytearray()
            self.last_audio_time[session_id] = now

        self.session_buffers[session_id].extend(audio_bytes)
        
        # In lightweight mode, returns RMS audio telemetry for real-time waveform sync
        return {
            "type": "audio_telemetry",
            "source": source,
            "rms": round(rms, 4),
            "timestamp": now,
        }

    def finalize_buffer(self, session_id: str, source: str = "mic") -> Optional[Dict[str, Any]]:
        """Flushes remaining audio for a session."""
        buf = self.session_buffers.pop(session_id, None)
        if not buf or len(buf) == 0:
            return None
        return {
            "type": "buffer_finalized",
            "bytes_processed": len(buf),
            "source": source
        }


# Global instance
transcriber = AudioTranscriber()
