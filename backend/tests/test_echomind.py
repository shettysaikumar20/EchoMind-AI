import pytest
from app.services.question_detector import heuristic_question_extractor, detect_questions_from_transcript
from app.services.ai_providers import OpenRouterProvider, BackboardAIProvider


# --- 1. Health & System Tests ---
def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


# --- 2. Session Lifecycle: Start -> Pause -> Resume -> Stop ---
def test_session_lifecycle(client, test_user):
    headers = test_user["headers"]

    # 1. Start / Create Session
    create_resp = client.post(
        "/api/sessions",
        json={"title": "Architectural Design Review", "capture_mode": "dual"},
        headers=headers
    )
    assert create_resp.status_code == 201
    session_data = create_resp.json()
    session_id = session_data["id"]
    assert session_data["status"] == "idle"
    assert session_data["capture_mode"] == "dual"

    # Set status to recording (Start)
    patch_resp = client.patch(
        f"/api/sessions/{session_id}",
        json={"status": "recording"},
        headers=headers
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "recording"

    # 2. Append live transcripts
    seg1 = client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "mic", "text": "Can you explain REST APIs?", "start_time": 0.0, "end_time": 2.5},
        headers=headers
    )
    assert seg1.status_code == 200
    assert seg1.json()["text"] == "Can you explain REST APIs?"

    seg2 = client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "tab", "text": "Also, what is the difference between authentication and authorization?", "start_time": 3.0, "end_time": 6.8},
        headers=headers
    )
    assert seg2.status_code == 200

    # 3. Pause Session
    pause_resp = client.patch(
        f"/api/sessions/{session_id}",
        json={"status": "paused", "duration_seconds": 6.8},
        headers=headers
    )
    assert pause_resp.status_code == 200
    assert pause_resp.json()["status"] == "paused"

    # 4. Trigger Question Detection on Pause
    detect_resp = client.post(
        f"/api/sessions/{session_id}/questions/detect",
        headers=headers
    )
    assert detect_resp.status_code == 200
    detect_data = detect_resp.json()
    assert len(detect_data["questions"]) == 2
    q1 = detect_data["questions"][0]["question_text"]
    q2 = detect_data["questions"][1]["question_text"]
    assert "REST APIs" in q1
    assert "authentication and authorization" in q2

    # 5. Resume / Continue Session
    cont_resp = client.post(
        f"/api/sessions/{session_id}/continue",
        headers=headers
    )
    assert cont_resp.status_code == 200
    cont_data = cont_resp.json()
    assert cont_data["id"] == session_id
    assert cont_data["status"] == "recording"
    assert len(cont_data["transcripts"]) == 2
    assert len(cont_data["questions"]) == 2

    # 6. Stop Session
    stop_resp = client.patch(
        f"/api/sessions/{session_id}",
        json={"status": "stopped", "duration_seconds": 12.4},
        headers=headers
    )
    assert stop_resp.status_code == 200
    assert stop_resp.json()["status"] == "stopped"


# --- 3. Question Detection Engine Tests ---
def test_multiple_question_extraction():
    text = "Can you explain REST APIs? Also, what is the difference between authentication and authorization?"
    questions = heuristic_question_extractor(text)
    assert len(questions) == 2
    assert questions[0].question_index == 1
    assert "Can you explain REST APIs?" in questions[0].question_text
    assert questions[1].question_index == 2
    assert "authentication and authorization" in questions[1].question_text


def test_no_question_transcripts():
    statement_text = "Today we reviewed the deployment pipeline and merged three pull requests. Everything is stable."
    questions = heuristic_question_extractor(statement_text)
    assert len(questions) == 0


@pytest.mark.asyncio
async def test_async_question_detector_deduplication():
    text = "How do we scale WebSockets? How do we scale WebSockets?"
    result = await detect_questions_from_transcript(text)
    assert len(result.questions) == 1
    assert "scale WebSockets" in result.questions[0].question_text


# --- 4. AI Provider Integration & Missing Credentials Handling ---
def test_openrouter_missing_credentials():
    provider = OpenRouterProvider(api_key="")
    with pytest.raises(ValueError, match="OpenRouter API key is missing"):
        import asyncio
        asyncio.run(provider.generate_chat_completion(messages=[{"role": "user", "content": "Hello"}]))


def test_backboard_missing_credentials():
    provider = BackboardAIProvider(api_key="")
    with pytest.raises(ValueError, match="Backboard AI API key is missing"):
        import asyncio
        asyncio.run(provider.generate_chat_completion(messages=[{"role": "user", "content": "Hello"}]))


# --- 5. Answer Generation Non-Streaming Endpoint ---
def test_answer_generation(client, test_user):
    headers = test_user["headers"]
    create_resp = client.post("/api/sessions", json={"title": "Test Q&A"}, headers=headers)
    session_id = create_resp.json()["id"]

    ans_resp = client.post(
        f"/api/sessions/{session_id}/answers?stream=false",
        json={
            "session_id": session_id,
            "question_text": "What is the difference between TCP and UDP?",
            "answer_length": "concise"
        },
        headers=headers
    )
    assert ans_resp.status_code == 200
    data = ans_resp.json()
    assert "TCP" in data["answer_text"] or "AI Provider Notice" in data["answer_text"]
    assert data["session_id"] == session_id


# --- 6. User Data Isolation ---
def test_user_data_isolation(client, test_user, second_user):
    headers1 = test_user["headers"]
    headers2 = second_user["headers"]

    # User 1 creates private session
    resp1 = client.post("/api/sessions", json={"title": "Confidential Strategy"}, headers=headers1)
    session1_id = resp1.json()["id"]

    # User 2 lists sessions -> should NOT see User 1's session
    list2 = client.get("/api/sessions", headers=headers2)
    assert list2.status_code == 200
    ids2 = [s["id"] for s in list2.json()]
    assert session1_id not in ids2

    # User 2 tries to GET User 1's session directly -> 404 Not Found
    get2 = client.get(f"/api/sessions/{session1_id}", headers=headers2)
    assert get2.status_code == 404

    # User 2 tries to DELETE User 1's session -> 404 Not Found
    del2 = client.delete(f"/api/sessions/{session1_id}", headers=headers2)
    assert del2.status_code == 404


# --- 7. Session Export (Markdown and JSON) ---
def test_session_export(client, test_user):
    headers = test_user["headers"]
    create_resp = client.post("/api/sessions", json={"title": "Sprint Retrospective"}, headers=headers)
    session_id = create_resp.json()["id"]

    client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "mic", "text": "What went well this week?", "start_time": 0.0, "end_time": 2.0},
        headers=headers
    )

    # Export markdown
    exp_md = client.get(f"/api/sessions/{session_id}/export?format=markdown", headers=headers)
    assert exp_md.status_code == 200
    assert "Sprint Retrospective" in exp_md.text
    assert "What went well this week?" in exp_md.text

    # Export json
    exp_json = client.get(f"/api/sessions/{session_id}/export?format=json", headers=headers)
    assert exp_json.status_code == 200
    assert exp_json.json()["id"] == session_id
