import json
import base64
import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.entities import SessionModel, TranscriptSegment
from app.services.transcription import (
    calculate_rms_and_peak,
    ElevenLabsRealtimeSession,
    transcriber,
    get_whisper_model
)

logger = logging.getLogger("echomind.ws")
router = APIRouter()


async def save_and_broadcast_transcript(
    session_id: str,
    transcript_data: dict,
    websocket: WebSocket,
    last_saved_segments: List[str],
    provider: str = "elevenlabs",
    db: Optional[Session] = None
):
    text = transcript_data.get("text", "").strip()
    source = transcript_data.get("source", "mic")
    is_final = transcript_data.get("is_final", True)
    start_time = float(transcript_data.get("start_time", 0.0))
    end_time = float(transcript_data.get("end_time", start_time + 1.0))

    if not text:
        return

    # Duplicate prevention: avoid saving repeated identical text
    normalized = text.lower().strip()
    if last_saved_segments and last_saved_segments[-1].lower().strip() == normalized:
        logger.debug(f"[WS] Suppressing duplicate transcript segment: '{text}'")
        return

    last_saved_segments.append(text)
    if len(last_saved_segments) > 20:
        last_saved_segments.pop(0)

    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True
    try:
        session_obj = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if session_obj:
            segment = TranscriptSegment(
                session_id=session_id,
                source=source,
                text=text,
                is_final=is_final,
                start_time=start_time,
                end_time=end_time
            )
            db.add(segment)
            session_obj.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(segment)

            logger.info(f"[WS] Persisted final segment for session {session_id} ({provider}): '{text}'")
            await websocket.send_text(json.dumps({
                "type": "transcript_saved",
                "id": segment.id,
                "source": segment.source,
                "text": segment.text,
                "is_final": segment.is_final,
                "start_time": segment.start_time,
                "end_time": segment.end_time,
                "created_at": segment.created_at.isoformat(),
                "provider": provider
            }))
    except Exception as e:
        logger.error(f"[WS] Error saving transcript for session {session_id}: {e}")
    finally:
        if should_close_db and db:
            db.close()


@router.websocket("/ws/sessions/{session_id}/transcribe")
async def websocket_transcription_endpoint(
    websocket: WebSocket,
    session_id: str
):
    await websocket.accept()
    logger.info(f"WebSocket client connected for session {session_id} (Provider: {settings.STT_PROVIDER})")
    
    total_received_bytes = 0
    last_saved_segments: List[str] = []
    session_start_epoch = time.time()
    last_committed_epoch = session_start_epoch
    stt_provider = settings.STT_PROVIDER.lower()

    el_session: Optional[ElevenLabsRealtimeSession] = None
    el_listener_task: Optional[asyncio.Task] = None

    if stt_provider == "elevenlabs":
        if not settings.ELEVENLABS_API_KEY:
            logger.warning("[ElevenLabs STT] ELEVENLABS_API_KEY is missing from environment.")
            await websocket.send_text(json.dumps({
                "type": "connection_established",
                "session_id": session_id,
                "provider": "elevenlabs",
                "model": settings.ELEVENLABS_MODEL_ID,
                "stt_ready": False,
                "whisper_ready": False,
                "error": "ELEVENLABS_API_KEY is missing. Please configure it in backend environment.",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }))
        else:
            el_session = ElevenLabsRealtimeSession()
            connected = await el_session.connect()
            if connected:
                await websocket.send_text(json.dumps({
                    "type": "connection_established",
                    "session_id": session_id,
                    "provider": "elevenlabs",
                    "model": settings.ELEVENLABS_MODEL_ID,
                    "stt_ready": True,
                    "whisper_ready": False,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }))

                async def elevenlabs_listener():
                    nonlocal last_committed_epoch
                    try:
                        while el_session and el_session.is_connected:
                            msg = await el_session.receive_message()
                            if msg is None:
                                break
                            
                            m_type = msg.get("message_type")
                            
                            if m_type == "partial_transcript":
                                p_text = msg.get("text", "").strip()
                                if p_text:
                                    await websocket.send_text(json.dumps({
                                        "type": "partial_transcript",
                                        "text": p_text,
                                        "provider": "elevenlabs"
                                    }))

                            elif m_type in ("committed_transcript", "committed_transcript_with_timestamps"):
                                c_text = msg.get("text", "").strip()
                                if c_text:
                                    now_epoch = time.time()
                                    start_time = max(0.0, round(last_committed_epoch - session_start_epoch, 2))
                                    end_time = max(start_time + 0.5, round(now_epoch - session_start_epoch, 2))
                                    last_committed_epoch = now_epoch

                                    await save_and_broadcast_transcript(
                                        session_id=session_id,
                                        transcript_data={
                                            "text": c_text,
                                            "source": "mic",
                                            "is_final": True,
                                            "start_time": start_time,
                                            "end_time": end_time
                                        },
                                        websocket=websocket,
                                        last_saved_segments=last_saved_segments,
                                        provider="elevenlabs"
                                    )
                                    # Clear interim text on commit
                                    await websocket.send_text(json.dumps({
                                        "type": "partial_transcript",
                                        "text": "",
                                        "provider": "elevenlabs"
                                    }))

                            elif m_type == "error":
                                err_msg = msg.get("error", "ElevenLabs transcription error")
                                logger.error(f"[ElevenLabs STT] Provider error: {err_msg}")
                                await websocket.send_text(json.dumps({
                                    "type": "error",
                                    "provider": "elevenlabs",
                                    "message": str(err_msg)
                                }))

                            elif m_type == "commit_throttled":
                                logger.debug(f"[ElevenLabs STT] Commit throttled: {msg}")

                    except asyncio.CancelledError:
                        pass
                    except Exception as err:
                        logger.warning(f"[ElevenLabs STT] Listener loop exception: {err}")

                el_listener_task = asyncio.create_task(elevenlabs_listener())
            else:
                await websocket.send_text(json.dumps({
                    "type": "connection_established",
                    "session_id": session_id,
                    "provider": "elevenlabs",
                    "model": settings.ELEVENLABS_MODEL_ID,
                    "stt_ready": False,
                    "whisper_ready": False,
                    "error": el_session.last_error or "Failed to connect to ElevenLabs Scribe STT",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }))
    else:
        # Whisper fallback mode
        whisper_ready = bool(get_whisper_model() is not None)
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "session_id": session_id,
            "provider": "whisper",
            "whisper_ready": whisper_ready,
            "stt_ready": whisper_ready,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }))

    try:
        while True:
            message = await websocket.receive()

            if "text" in message:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type == "ping":
                        await websocket.send_text(json.dumps({
                            "type": "pong",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }))

                    elif msg_type == "transcript_segment":
                        await save_and_broadcast_transcript(
                            session_id=session_id,
                            transcript_data=payload,
                            websocket=websocket,
                            last_saved_segments=last_saved_segments,
                            provider=payload.get("provider", "client")
                        )

                    elif msg_type == "audio_chunk":
                        raw_b64 = payload.get("data", "")
                        source = payload.get("source", "mic")
                        if raw_b64:
                            audio_bytes = base64.b64decode(raw_b64)
                            total_received_bytes += len(audio_bytes)
                            rms, peak = calculate_rms_and_peak(audio_bytes)
                            speech_detected = rms >= 0.003

                            if el_session and el_session.is_connected:
                                await el_session.send_audio_chunk(audio_bytes, commit=False)
                                await websocket.send_text(json.dumps({
                                    "type": "audio_telemetry",
                                    "source": source,
                                    "rms": round(rms, 4),
                                    "peak": round(peak, 4),
                                    "provider": "elevenlabs",
                                    "stt_ready": True,
                                    "speech_detected": speech_detected,
                                    "bytes_received": total_received_bytes,
                                    "chunk_size": len(audio_bytes),
                                    "timestamp": time.time()
                                }))
                            else:
                                # Whisper fallback
                                telemetry = transcriber.process_audio_chunk(
                                    session_id=session_id,
                                    audio_bytes=audio_bytes,
                                    source=source
                                )
                                if telemetry:
                                    if "transcript" in telemetry:
                                        await save_and_broadcast_transcript(
                                            session_id=session_id,
                                            transcript_data=telemetry["transcript"],
                                            websocket=websocket,
                                            last_saved_segments=last_saved_segments,
                                            provider="whisper"
                                        )
                                    await websocket.send_text(json.dumps(telemetry))

                    elif msg_type == "flush":
                        if el_session and el_session.is_connected:
                            await el_session.flush()
                        else:
                            res = transcriber.finalize_buffer(session_id)
                            if res:
                                await save_and_broadcast_transcript(
                                    session_id=session_id,
                                    transcript_data=res,
                                    websocket=websocket,
                                    last_saved_segments=last_saved_segments,
                                    provider="whisper"
                                )

                except json.JSONDecodeError:
                    pass

            elif "bytes" in message:
                raw_bytes = message["bytes"]
                total_received_bytes += len(raw_bytes)
                rms, peak = calculate_rms_and_peak(raw_bytes)
                speech_detected = rms >= 0.003

                if el_session and el_session.is_connected:
                    await el_session.send_audio_chunk(raw_bytes, commit=False)
                    await websocket.send_text(json.dumps({
                        "type": "audio_telemetry",
                        "source": "mic",
                        "rms": round(rms, 4),
                        "peak": round(peak, 4),
                        "provider": "elevenlabs",
                        "stt_ready": True,
                        "speech_detected": speech_detected,
                        "bytes_received": total_received_bytes,
                        "chunk_size": len(raw_bytes),
                        "timestamp": time.time()
                    }))
                else:
                    # Whisper fallback
                    telemetry = transcriber.process_audio_chunk(
                        session_id=session_id,
                        audio_bytes=raw_bytes,
                        source="mic"
                    )
                    if telemetry:
                        if "transcript" in telemetry:
                            await save_and_broadcast_transcript(
                                session_id=session_id,
                                transcript_data=telemetry["transcript"],
                                websocket=websocket,
                                last_saved_segments=last_saved_segments,
                                provider="whisper"
                            )
                        await websocket.send_text(json.dumps(telemetry))

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error in session {session_id}: {e}")
    finally:
        if el_session:
            try:
                await el_session.flush()
                await asyncio.sleep(0.3)
                await el_session.close()
            except Exception:
                pass
        if el_listener_task and not el_listener_task.done():
            el_listener_task.cancel()
