import json
import base64
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.entities import SessionModel, TranscriptSegment
from app.services.transcription import transcriber

logger = logging.getLogger("echomind.ws")
router = APIRouter()


async def save_and_broadcast_transcript(session_id: str, transcript_data: dict, websocket: WebSocket):
    text = transcript_data.get("text", "").strip()
    source = transcript_data.get("source", "mic")
    is_final = transcript_data.get("is_final", True)
    start_time = float(transcript_data.get("start_time", 0.0))
    end_time = float(transcript_data.get("end_time", start_time + 1.0))

    if not text:
        return

    db: Session = SessionLocal()
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

            await websocket.send_text(json.dumps({
                "type": "transcript_saved",
                "id": segment.id,
                "source": segment.source,
                "text": segment.text,
                "is_final": segment.is_final,
                "start_time": segment.start_time,
                "end_time": segment.end_time,
                "created_at": segment.created_at.isoformat()
            }))
    finally:
        db.close()


@router.websocket("/ws/sessions/{session_id}/transcribe")
async def websocket_transcription_endpoint(
    websocket: WebSocket,
    session_id: str
):
    await websocket.accept()
    logger.info(f"WebSocket client connected for session {session_id}")
    total_received_bytes = 0

    model = transcriber.finalize_buffer  # reference
    from app.services.transcription import get_whisper_model
    whisper_ready = bool(get_whisper_model() is not None)

    await websocket.send_text(json.dumps({
        "type": "connection_established",
        "session_id": session_id,
        "whisper_ready": whisper_ready,
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
                        # Client-side recognized speech segment (Web Speech API)
                        await save_and_broadcast_transcript(session_id, payload, websocket)

                    elif msg_type == "audio_chunk":
                        # Ingest base64 encoded audio
                        raw_b64 = payload.get("data", "")
                        source = payload.get("source", "mic")
                        if raw_b64:
                            audio_bytes = base64.b64decode(raw_b64)
                            total_received_bytes += len(audio_bytes)
                            telemetry = transcriber.process_audio_chunk(
                                session_id=session_id,
                                audio_bytes=audio_bytes,
                                source=source
                            )
                            if telemetry:
                                if "transcript" in telemetry:
                                    await save_and_broadcast_transcript(session_id, telemetry["transcript"], websocket)
                                await websocket.send_text(json.dumps({
                                    "type": "audio_telemetry",
                                    "source": telemetry.get("source"),
                                    "rms": telemetry.get("rms", 0.0),
                                    "peak": telemetry.get("peak", 0.0),
                                    "buffer_seconds": telemetry.get("buffer_seconds", 0.0),
                                    "whisper_ready": telemetry.get("whisper_ready", False),
                                    "speech_detected": telemetry.get("speech_detected", False),
                                    "attempt_count": telemetry.get("attempt_count", 0),
                                    "success_count": telemetry.get("success_count", 0),
                                    "last_transcription": telemetry.get("last_transcription", ""),
                                    "timestamp": telemetry.get("timestamp"),
                                    "bytes_received": total_received_bytes,
                                    "chunk_size": len(audio_bytes)
                                }))

                    elif msg_type == "flush":
                        res = transcriber.finalize_buffer(session_id)
                        if res:
                            await save_and_broadcast_transcript(session_id, res, websocket)

                except json.JSONDecodeError:
                    pass

            elif "bytes" in message:
                # Raw binary PCM stream
                raw_bytes = message["bytes"]
                total_received_bytes += len(raw_bytes)
                telemetry = transcriber.process_audio_chunk(
                    session_id=session_id,
                    audio_bytes=raw_bytes,
                    source="mic"
                )
                if telemetry:
                    if "transcript" in telemetry:
                        await save_and_broadcast_transcript(session_id, telemetry["transcript"], websocket)
                    await websocket.send_text(json.dumps({
                        "type": "audio_telemetry",
                        "source": telemetry.get("source"),
                        "rms": telemetry.get("rms", 0.0),
                        "peak": telemetry.get("peak", 0.0),
                        "buffer_seconds": telemetry.get("buffer_seconds", 0.0),
                        "whisper_ready": telemetry.get("whisper_ready", False),
                        "speech_detected": telemetry.get("speech_detected", False),
                        "attempt_count": telemetry.get("attempt_count", 0),
                        "success_count": telemetry.get("success_count", 0),
                        "last_transcription": telemetry.get("last_transcription", ""),
                        "timestamp": telemetry.get("timestamp"),
                        "bytes_received": total_received_bytes,
                        "chunk_size": len(raw_bytes)
                    }))

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for session {session_id}")
        final_res = transcriber.finalize_buffer(session_id)
        if final_res:
            try:
                db = SessionLocal()
                session_obj = db.query(SessionModel).filter(SessionModel.id == session_id).first()
                if session_obj:
                    segment = TranscriptSegment(
                        session_id=session_id,
                        source=final_res.get("source", "mic"),
                        text=final_res.get("text", ""),
                        is_final=True,
                        start_time=final_res.get("start_time", 0.0),
                        end_time=final_res.get("end_time", 1.0)
                    )
                    db.add(segment)
                    db.commit()
                db.close()
            except Exception:
                pass
    except Exception as e:
        logger.error(f"WebSocket error in session {session_id}: {e}")
