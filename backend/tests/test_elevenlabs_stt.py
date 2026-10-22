import os
import wave
import json
import base64
import time
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.core.config import settings
from app.services.transcription import ElevenLabsRealtimeSession, calculate_rms_and_peak
from app.websockets.transcribe_ws import save_and_broadcast_transcript
from app.models.entities import SessionModel, TranscriptSegment


# --- 1. Audio Processing & RMS Calculations ---
def test_calculate_rms_and_peak():
    # Empty bytes
    rms, peak = calculate_rms_and_peak(b"")
    assert rms == 0.0
    assert peak == 0.0

    # Silent PCM (16-bit zeros)
    silence = bytes(3200)
    rms, peak = calculate_rms_and_peak(silence)
    assert rms == 0.0
    assert peak == 0.0


# --- 2. Duplicate Prevention ---
@pytest.mark.asyncio
async def test_duplicate_transcript_prevention(test_user, db_session):
    # Create test session in DB
    session_obj = SessionModel(
        user_id=test_user["user"].id,
        title="Deduplication Test",
        capture_mode="mic"
    )
    db_session.add(session_obj)
    db_session.commit()
    db_session.refresh(session_obj)

    mock_ws = AsyncMock()
    last_saved = []

    # Save segment 1
    await save_and_broadcast_transcript(
        session_id=session_obj.id,
        transcript_data={"text": "What is Java programming?", "source": "mic"},
        websocket=mock_ws,
        last_saved_segments=last_saved,
        provider="elevenlabs",
        db=db_session
    )
    assert len(last_saved) == 1
    assert mock_ws.send_text.call_count == 1

    # Attempt to save exact same segment again -> should be ignored
    await save_and_broadcast_transcript(
        session_id=session_obj.id,
        transcript_data={"text": "What is Java programming?   ", "source": "mic"},
        websocket=mock_ws,
        last_saved_segments=last_saved,
        provider="elevenlabs",
        db=db_session
    )
    assert len(last_saved) == 1
    assert mock_ws.send_text.call_count == 1  # No second broadcast!

    # Save different segment -> should succeed
    await save_and_broadcast_transcript(
        session_id=session_obj.id,
        transcript_data={"text": "What is the difference between SQL and NoSQL?", "source": "mic"},
        websocket=mock_ws,
        last_saved_segments=last_saved,
        provider="elevenlabs",
        db=db_session
    )
    assert len(last_saved) == 2
    assert mock_ws.send_text.call_count == 2


# --- 3. Final Transcript Persistence ---
@pytest.mark.asyncio
async def test_final_transcript_persistence(test_user, db_session):
    session_obj = SessionModel(
        user_id=test_user["user"].id,
        title="Persistence Test",
        capture_mode="mic"
    )
    db_session.add(session_obj)
    db_session.commit()
    db_session.refresh(session_obj)

    mock_ws = AsyncMock()
    last_saved = []

    await save_and_broadcast_transcript(
        session_id=session_obj.id,
        transcript_data={
            "text": "Explain artificial intelligence in simple terms.",
            "source": "mic",
            "is_final": True,
            "start_time": 1.2,
            "end_time": 4.5
        },
        websocket=mock_ws,
        last_saved_segments=last_saved,
        provider="elevenlabs",
        db=db_session
    )

    # Verify database record
    seg = db_session.query(TranscriptSegment).filter(
        TranscriptSegment.session_id == session_obj.id
    ).first()
    assert seg is not None
    assert seg.text == "Explain artificial intelligence in simple terms."
    assert seg.is_final is True
    assert seg.start_time == 1.2
    assert seg.end_time == 4.5


# --- 4. Missing API Key & Error Handling ---
@pytest.mark.asyncio
async def test_elevenlabs_missing_api_key():
    el = ElevenLabsRealtimeSession(api_key="")
    success = await el.connect()
    assert success is False
    assert "ELEVENLABS_API_KEY is not configured" in (el.last_error or "")


# --- 5. Pause/Stop & Flush Behavior ---
@pytest.mark.asyncio
async def test_pause_and_flush_behavior():
    el = ElevenLabsRealtimeSession(api_key="sk-test-fake")
    el.ws = AsyncMock()
    el.is_connected = True

    # Sending flush sends empty base64 with commit=True
    flushed = await el.flush()
    assert flushed is True
    assert el.ws.send.called
    sent_payload = json.loads(el.ws.send.call_args[0][0])
    assert sent_payload["message_type"] == "input_audio_chunk"
    assert sent_payload["commit"] is True

    # Clean close
    await el.close()
    assert el.is_connected is False


# --- 6. Live ElevenLabs Scribe STT Verification with the 3 Spoken Sentences ---
@pytest.mark.asyncio
async def test_live_elevenlabs_three_sentences_and_qa_pipeline(client, test_user, db_session):
    """
    Phase 7 requirement:
    Test these spoken sentences:
    1. 'What is Java programming?'
    2. 'What is the difference between SQL and NoSQL?'
    3. 'Explain artificial intelligence in simple terms.'
    Verify that spoken sentences appear correctly in the transcript and that detected questions reach OpenRouter.
    """
    if not settings.ELEVENLABS_API_KEY:
        pytest.skip("ELEVENLABS_API_KEY not configured for live test")

    headers = test_user["headers"]
    create_resp = client.post(
        "/api/sessions",
        json={"title": "Live ElevenLabs Benchmark", "capture_mode": "mic"},
        headers=headers
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]

    # Test file paths
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    q1_file = os.path.join(fixtures_dir, "q1_java.wav")
    q2_file = os.path.join(fixtures_dir, "q2_sql.wav")
    q3_file = os.path.join(fixtures_dir, "q3_ai.wav")

    if not (os.path.exists(q1_file) and os.path.exists(q2_file) and os.path.exists(q3_file)):
        pytest.skip("Test WAV fixtures not found")

    async def transcribe_wav(file_path: str) -> str:
        with wave.open(file_path, "rb") as wf:
            pcm_bytes = wf.readframes(wf.getnframes())

        el = ElevenLabsRealtimeSession()
        connected = await el.connect()
        assert connected is True, f"ElevenLabs connection failed: {el.last_error}"

        committed_parts = []

        async def reader():
            try:
                while el.is_connected:
                    msg = await el.receive_message()
                    if not msg:
                        break
                    m_type = msg.get("message_type")
                    if m_type in ("committed_transcript", "committed_transcript_with_timestamps"):
                        txt = msg.get("text", "").strip()
                        if txt:
                            committed_parts.append(txt)
            except Exception:
                pass

        listen_task = asyncio.create_task(reader())

        chunk_size = 3200
        for i in range(0, len(pcm_bytes), chunk_size):
            await el.send_audio_chunk(pcm_bytes[i:i+chunk_size], commit=False)
            await asyncio.sleep(0.04)

        # Silence for VAD
        silence = bytes(3200)
        for _ in range(12):
            await el.send_audio_chunk(silence, commit=False)
            await asyncio.sleep(0.04)

        await el.flush()
        await asyncio.sleep(1.0)
        await el.close()
        listen_task.cancel()

        return " ".join(committed_parts).strip()

    # Sentence 1: "What is Java programming?"
    transcript_1 = await transcribe_wav(q1_file)
    assert "java" in transcript_1.lower()
    client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "mic", "text": transcript_1, "start_time": 0.0, "end_time": 3.0},
        headers=headers
    )

    # Sentence 2: "What is the difference between SQL and NoSQL?"
    transcript_2 = await transcribe_wav(q2_file)
    assert "sql" in transcript_2.lower()
    client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "mic", "text": transcript_2, "start_time": 3.5, "end_time": 7.0},
        headers=headers
    )

    # Sentence 3: "Explain artificial intelligence in simple terms."
    transcript_3 = await transcribe_wav(q3_file)
    assert "artificial intelligence" in transcript_3.lower() or "ai" in transcript_3.lower()
    client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "mic", "text": transcript_3, "start_time": 7.5, "end_time": 11.0},
        headers=headers
    )

    # Pause session
    client.patch(f"/api/sessions/{session_id}", json={"status": "paused"}, headers=headers)

    # Detect questions from the ElevenLabs transcript
    detect_resp = client.post(f"/api/sessions/{session_id}/questions/detect", headers=headers)
    assert detect_resp.status_code == 200
    questions_data = detect_resp.json()["questions"]
    assert len(questions_data) >= 2

    # Verify detected questions reach OpenRouter answer pipeline
    q1 = questions_data[0]
    ans_resp = client.post(
        f"/api/sessions/{session_id}/answers?stream=false",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "question_text": q1["question_text"],
            "answer_length": "concise"
        },
        headers=headers
    )
    assert ans_resp.status_code == 200
    ans_data = ans_resp.json()
    assert len(ans_data["answer_text"]) > 10
