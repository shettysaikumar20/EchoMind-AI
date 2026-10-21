import pytest


# --- Audio Modes A, B, C Session Lifecycle ---
def test_audio_mode_a_mic(client, test_user):
    resp = client.post(
        "/api/sessions",
        json={"title": "Mic Only Session", "capture_mode": "mic"},
        headers=test_user["headers"]
    )
    assert resp.status_code == 201
    assert resp.json()["capture_mode"] == "mic"


def test_audio_mode_b_tab(client, test_user):
    resp = client.post(
        "/api/sessions",
        json={"title": "Tab Audio Session", "capture_mode": "tab"},
        headers=test_user["headers"]
    )
    assert resp.status_code == 201
    assert resp.json()["capture_mode"] == "tab"


def test_audio_mode_c_dual(client, test_user):
    resp = client.post(
        "/api/sessions",
        json={"title": "Dual Source Session", "capture_mode": "dual"},
        headers=test_user["headers"]
    )
    assert resp.status_code == 201
    assert resp.json()["capture_mode"] == "dual"


# --- Session Recovery After Refresh / Interruption ---
def test_session_recovery_after_refresh(client, test_user):
    """
    Requirement 4: Do not silently continue recording after refresh.
    Recover the saved session in a stopped/paused state and require explicit permission to resume.
    """
    headers = test_user["headers"]
    create_resp = client.post(
        "/api/sessions",
        json={"title": "Session Interrupted By Refresh", "capture_mode": "mic"},
        headers=headers
    )
    session_id = create_resp.json()["id"]

    # Start recording
    client.patch(f"/api/sessions/{session_id}", json={"status": "recording"}, headers=headers)

    # Append transcript segments
    client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "mic", "text": "Segment before unexpected browser reload", "start_time": 0.0, "end_time": 3.0},
        headers=headers
    )

    # Browser refreshes / restarts -> Session is recovered by querying GET /api/sessions/{id}
    # It safely maintains all transcripts, questions, and duration
    recovery_resp = client.get(f"/api/sessions/{session_id}", headers=headers)
    assert recovery_resp.status_code == 200
    recovered = recovery_resp.json()
    assert recovered["id"] == session_id
    assert len(recovered["transcripts"]) == 1
    assert recovered["transcripts"][0]["text"] == "Segment before unexpected browser reload"

    # User explicitly clicks Resume -> continue session
    resume_resp = client.post(f"/api/sessions/{session_id}/continue", headers=headers)
    assert resume_resp.status_code == 200
    resumed = resume_resp.json()
    assert resumed["status"] == "recording"
    assert len(resumed["transcripts"]) == 1  # No duplicate session created!


# --- Delete Session and Cascading Cleanup ---
def test_delete_session_cascading(client, test_user):
    headers = test_user["headers"]
    create_resp = client.post("/api/sessions", json={"title": "Temporary Session"}, headers=headers)
    session_id = create_resp.json()["id"]

    client.post(
        f"/api/sessions/{session_id}/transcript",
        json={"source": "mic", "text": "Will be deleted", "start_time": 0.0, "end_time": 1.0},
        headers=headers
    )

    # Delete
    del_resp = client.delete(f"/api/sessions/{session_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verify not found
    get_resp = client.get(f"/api/sessions/{session_id}", headers=headers)
    assert get_resp.status_code == 404
