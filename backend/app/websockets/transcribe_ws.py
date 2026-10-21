import json
import base64
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.entities import SessionModel, TranscriptSegment
from app.services.transcription import transcriber

logger = logging.getLogger("echomind.ws")
router = APIRouter()


@router.websocket("/ws/sessions/{session_id}/transcribe")
async def websocket_transcription_endpoint(
    websocket: WebSocket,
    session_id: str
):
    await websocket.accept()
    logger.info(f"WebSocket client connected for session {session_id}")

    # Send initial connection confirmation
    await websocket.send_text(json.dumps({
        "type": "connection_established",
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }))

    try:
        while True:
            # Receive either text (JSON) or binary
            message = await websocket.receive()
            
            if "text" in message:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type == "ping":
                        await websocket.send_text(json.dumps({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}))

                    elif msg_type == "transcript_segment":
                        # Client-side recognized speech segment
                        text = payload.get("text", "").strip()
                        source = payload.get("source", "mic")
                        is_final = payload.get("is_final", True)
                        start_time = float(payload.get("start_time", 0.0))
                        end_time = float(payload.get("end_time", start_time + 1.0))

                        if text:
                            # Persist segment to database
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

                                    # Broadcast verified saved transcript back to client
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

                    elif msg_type == "audio_chunk":
                        # Ingest base64 encoded audio
                        raw_b64 = payload.get("data", "")
                        source = payload.get("source", "mic")
                        if raw_b64:
                            audio_bytes = base64.b64decode(raw_b64)
                            telemetry = transcriber.process_audio_chunk(
                                session_id=session_id,
                                audio_bytes=audio_bytes,
                                source=source
                            )
                            if telemetry:
                                await websocket.send_text(json.dumps(telemetry))

                    elif msg_type == "flush":
                        res = transcriber.finalize_buffer(session_id)
                        if res:
                            await websocket.send_text(json.dumps(res))

                except json.JSONDecodeError:
                    pass

            elif "bytes" in message:
                # Raw binary PCM stream
                raw_bytes = message["bytes"]
                telemetry = transcriber.process_audio_chunk(
                    session_id=session_id,
                    audio_bytes=raw_bytes,
                    source="mic"
                )
                if telemetry:
                    await websocket.send_text(json.dumps(telemetry))

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for session {session_id}")
        transcriber.finalize_buffer(session_id)
    except Exception as e:
        logger.error(f"WebSocket error in session {session_id}: {e}")
