import math
import struct
import time
import json
import base64
import logging
import asyncio
from typing import Optional, Dict, Any, List, Tuple
import numpy as np
import websockets
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
        except ImportError:
            logger.info("faster-whisper not installed; ElevenLabs Scribe Realtime is active provider.")
            _whisper_model = False
        except Exception as e:
            logger.warning(f"faster-whisper initialization note: {e}")
            _whisper_model = False
    return _whisper_model if _whisper_model is not False else None


def calculate_rms_and_peak(pcm_data: bytes) -> Tuple[float, float]:
    """Calculate Root Mean Square (RMS) amplitude and peak from 16-bit PCM bytes."""
    if len(pcm_data) < 2:
        return 0.0, 0.0
    count = len(pcm_data) // 2
    try:
        shorts = struct.unpack(f"<{count}h", pcm_data[:count * 2])
        sum_squares = sum(s * s for s in shorts)
        peak_val = max(abs(s) for s in shorts)
        rms = math.sqrt(sum_squares / count)
        return min(1.0, rms / 32768.0), min(1.0, peak_val / 32768.0)
    except Exception:
        return 0.0, 0.0


class ElevenLabsRealtimeSession:
    """
    Manages an active upstream real-time STT WebSocket connection to ElevenLabs Scribe v2.
    """
    def __init__(self, api_key: Optional[str] = None, model_id: Optional[str] = None):
        self.api_key = settings.ELEVENLABS_API_KEY if api_key is None else api_key
        self.model_id = model_id or settings.ELEVENLABS_MODEL_ID
        self.ws = None
        self.session_id: Optional[str] = None
        self.last_error: Optional[str] = None
        self.is_connected = False
        self.uncommitted_bytes = 0
        self.sample_rate = 16000

    async def connect(self) -> bool:
        if not self.api_key:
            self.last_error = "ELEVENLABS_API_KEY is not configured"
            logger.error("[ElevenLabs STT] Cannot connect: ELEVENLABS_API_KEY is missing")
            return False

        # Endpoint with scribe_v2_realtime and 16kHz PCM
        url = (
            f"{settings.ELEVENLABS_WS_URL}?"
            f"model_id={self.model_id}&"
            f"audio_format=pcm_16000&"
            f"commit_strategy=vad"
        )
        headers = {"xi-api-key": self.api_key}

        try:
            logger.info(f"[ElevenLabs STT] Connecting to {url}...")
            try:
                self.ws = await websockets.connect(
                    url,
                    additional_headers=headers,
                    ping_interval=20,
                    ping_timeout=20
                )
            except TypeError:
                self.ws = await websockets.connect(
                    url,
                    extra_headers=headers,
                    ping_interval=20,
                    ping_timeout=20
                )

            # Await session_started handshake
            init_msg = await asyncio.wait_for(self.ws.recv(), timeout=8.0)
            data = json.loads(init_msg)
            if data.get("message_type") == "session_started":
                self.session_id = data.get("session_id")
                self.is_connected = True
                self.last_error = None
                logger.info(f"[ElevenLabs STT] Connected successfully! Session ID: {self.session_id}")
                return True
            else:
                self.last_error = f"Unexpected handshake message: {data}"
                logger.warning(f"[ElevenLabs STT] Handshake unexpected: {data}")
                return False
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"[ElevenLabs STT] Connection error: {e}")
            self.is_connected = False
            if self.ws:
                try:
                    await self.ws.close()
                except Exception:
                    pass
                self.ws = None
            return False

    async def send_audio_chunk(self, audio_bytes: bytes, commit: bool = False) -> bool:
        if not self.ws or not self.is_connected:
            return False

        try:
            payload = {
                "message_type": "input_audio_chunk",
                "audio_base_64": base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else "",
                "commit": commit
            }
            await self.ws.send(json.dumps(payload))
            if audio_bytes:
                self.uncommitted_bytes += len(audio_bytes)
            if commit:
                self.uncommitted_bytes = 0
            return True
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"[ElevenLabs STT] Send error: {e}")
            return False

    async def flush(self) -> bool:
        """
        Request ElevenLabs to commit any pending uncommitted speech audio.
        """
        if not self.ws or not self.is_connected:
            return False
        try:
            payload = {
                "message_type": "input_audio_chunk",
                "audio_base_64": "",
                "commit": True
            }
            await self.ws.send(json.dumps(payload))
            self.uncommitted_bytes = 0
            return True
        except Exception as e:
            self.last_error = str(e)
            return False

    async def receive_message(self) -> Optional[Dict[str, Any]]:
        if not self.ws or not self.is_connected:
            return None
        try:
            raw = await self.ws.recv()
            if isinstance(raw, str):
                return json.loads(raw)
            return None
        except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
            self.is_connected = False
            return None
        except Exception as e:
            self.last_error = str(e)
            logger.warning(f"[ElevenLabs STT] Recv error: {e}")
            return None

    async def close(self):
        self.is_connected = False
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None


class AudioTranscriber:
    """
    Speech-to-text service adapter for optional local Whisper fallback.
    """
    def __init__(self, mode: Optional[str] = None):
        self.mode = mode or settings.STT_MODE
        self.session_buffers: Dict[str, bytearray] = {}
        self.session_start_times: Dict[str, float] = {}
        self.session_init_epoch: Dict[str, float] = {}
        self.last_speech_time: Dict[str, float] = {}
        self.transcription_attempts: Dict[str, int] = {}
        self.transcription_successes: Dict[str, int] = {}
        self.last_transcript_text: Dict[str, str] = {}
        self.last_error: Dict[str, str] = {}
        self.sample_rate = 16000

    def calculate_rms_and_peak(self, pcm_data: bytes) -> tuple[float, float]:
        return calculate_rms_and_peak(pcm_data)

    def calculate_rms(self, pcm_data: bytes) -> float:
        rms, _ = self.calculate_rms_and_peak(pcm_data)
        return rms

    def pcm_to_float32(self, pcm_bytes: bytes) -> np.ndarray:
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
        now = timestamp or time.time()
        rms, peak = self.calculate_rms_and_peak(audio_bytes)

        if session_id not in self.session_init_epoch:
            self.session_init_epoch[session_id] = now

        if session_id not in self.session_buffers:
            self.session_buffers[session_id] = bytearray()
            self.session_start_times[session_id] = now
            self.last_speech_time[session_id] = now

        self.session_buffers[session_id].extend(audio_bytes)
        buffer_len = len(self.session_buffers[session_id])
        buffer_seconds = round(buffer_len / (self.sample_rate * 2), 2)

        is_speech = rms >= 0.003
        if is_speech:
            self.last_speech_time[session_id] = now

        model = get_whisper_model()
        result: Dict[str, Any] = {
            "type": "audio_telemetry",
            "source": source,
            "rms": round(rms, 4),
            "peak": round(peak, 4),
            "buffer_seconds": buffer_seconds,
            "whisper_ready": bool(model is not None),
            "speech_detected": is_speech,
            "attempt_count": self.transcription_attempts.get(session_id, 0),
            "success_count": self.transcription_successes.get(session_id, 0),
            "last_transcription": self.last_transcript_text.get(session_id, ""),
            "timestamp": now,
        }

        bytes_for_1s = self.sample_rate * 2
        bytes_for_3s = int(bytes_for_1s * 3.0)
        silence_gap = now - self.last_speech_time.get(session_id, now)

        should_transcribe = False
        if buffer_len >= bytes_for_3s:
            should_transcribe = True
        elif buffer_len >= int(bytes_for_1s * 0.8) and silence_gap >= 0.6:
            should_transcribe = True

        if should_transcribe:
            transcription = self.finalize_buffer(session_id, source=source)
            if transcription and transcription.get("text"):
                result["transcript"] = transcription
                result["last_transcription"] = transcription["text"]
                result["success_count"] = self.transcription_successes.get(session_id, 0)

        return result

    def finalize_buffer(self, session_id: str, source: str = "mic") -> Optional[Dict[str, Any]]:
        buf = self.session_buffers.pop(session_id, None)
        now = time.time()
        start_epoch = self.session_start_times.pop(session_id, now)
        init_epoch = self.session_init_epoch.get(session_id, start_epoch)
        rel_start = max(0.0, round(start_epoch - init_epoch, 1))
        rel_end = max(rel_start + 0.5, round(now - init_epoch, 1))

        if not buf or len(buf) < (self.sample_rate // 2):
            return None

        self.transcription_attempts[session_id] = self.transcription_attempts.get(session_id, 0) + 1

        model = get_whisper_model()
        if not model:
            logger.debug(f"[STT] Whisper model not ready for session {session_id}")
            return None

        try:
            audio_array = self.pcm_to_float32(bytes(buf))
            if len(audio_array) == 0:
                return None

            dur = len(audio_array) / self.sample_rate
            logger.info(f"[STT] Running faster-whisper transcription for session {session_id} on {dur:.2f}s of audio...")

            segments, info = model.transcribe(
                audio_array,
                beam_size=1,
                language="en",
                condition_on_previous_text=False,
                vad_filter=False,
            )

            text_parts = [s.text.strip() for s in segments if s.text.strip()]
            full_text = " ".join(text_parts).strip()

            if full_text:
                self.transcription_successes[session_id] = self.transcription_successes.get(session_id, 0) + 1
                self.last_transcript_text[session_id] = full_text
                logger.info(f"[STT] Success: '{full_text}' (lang={info.language})")
                return {
                    "text": full_text,
                    "source": source,
                    "is_final": True,
                    "start_time": rel_start,
                    "end_time": rel_end,
                    "language": info.language,
                }
            else:
                logger.debug("[STT] Completed with empty text (ambient noise)")
        except Exception as e:
            self.last_error[session_id] = str(e)
            logger.error(f"[STT] Error during faster-whisper transcription: {e}")

        return None


# Global instance for fallback
transcriber = AudioTranscriber()
