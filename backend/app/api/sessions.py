from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.entities import SessionModel, TranscriptSegment, DetectedQuestion, AIAnswer, User
from app.schemas.schemas import (
    SessionCreate,
    SessionUpdate,
    SessionResponse,
    SessionDetailResponse,
    TranscriptSegmentCreate,
    TranscriptSegmentResponse,
    QuestionWithAnswerResponse,
    AIAnswerResponse,
)
from app.api.deps import get_current_user
from app.services.memory import ConversationMemory

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    session_in: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = SessionModel(
        user_id=current_user.id,
        title=session_in.title or f"Conversation {datetime.now(timezone.utc).strftime('%b %d, %H:%M')}",
        capture_mode=session_in.capture_mode or "mic",
        status="idle",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("", response_model=List[SessionResponse])
def list_sessions(
    q: Optional[str] = Query(None, description="Search query for session title or summary"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(SessionModel).filter(SessionModel.user_id == current_user.id)
    if q:
        query = query.filter(
            (SessionModel.title.ilike(f"%{q}%")) | (SessionModel.summary.ilike(f"%{q}%"))
        )
    sessions = query.order_by(SessionModel.updated_at.desc()).all()

    # Enrich with counts and duration
    result = []
    for s in sessions:
        q_count = db.query(func.count(DetectedQuestion.id)).filter(DetectedQuestion.session_id == s.id).scalar() or 0
        a_count = db.query(func.count(AIAnswer.id)).filter(AIAnswer.session_id == s.id).scalar() or 0
        
        duration = float(s.duration_seconds or 0.0)
        if duration == 0.0:
            max_end = db.query(func.max(TranscriptSegment.end_time)).filter(
                TranscriptSegment.session_id == s.id,
                TranscriptSegment.end_time < 100000
            ).scalar()
            if max_end:
                duration = round(float(max_end), 1)

        resp = SessionResponse.model_validate(s)
        resp.question_count = q_count
        resp.answer_count = a_count
        resp.duration_seconds = duration
        result.append(resp)
    return result


@router.get("/{session_id}", response_model=SessionDetailResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    transcripts = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.session_id == session_id)
        .order_by(TranscriptSegment.created_at.asc())
        .all()
    )

    questions = (
        db.query(DetectedQuestion)
        .filter(DetectedQuestion.session_id == session_id)
        .order_by(DetectedQuestion.question_index.asc())
        .all()
    )

    questions_with_answers = []
    for q in questions:
        answers = (
            db.query(AIAnswer)
            .filter(AIAnswer.question_id == q.id)
            .order_by(AIAnswer.created_at.asc())
            .all()
        )
        q_dict = {
            "id": q.id,
            "session_id": q.session_id,
            "question_text": q.question_text,
            "context_snippet": q.context_snippet,
            "question_index": q.question_index,
            "detected_at": q.detected_at,
            "answers": [AIAnswerResponse.model_validate(a) for a in answers]
        }
        questions_with_answers.append(QuestionWithAnswerResponse(**q_dict))

    q_count = len(questions)
    a_count = sum(len(q.answers) for q in questions_with_answers)

    duration = float(session.duration_seconds or 0.0)
    if duration == 0.0 and transcripts:
        valid_ends = [t.end_time for t in transcripts if t.end_time and t.end_time < 100000]
        if valid_ends:
            duration = round(float(max(valid_ends)), 1)

    resp = SessionDetailResponse.model_validate(session)
    resp.duration_seconds = duration
    resp.question_count = q_count
    resp.answer_count = a_count
    resp.transcripts = [TranscriptSegmentResponse.model_validate(t) for t in transcripts]
    resp.questions = questions_with_answers
    return resp


@router.patch("/{session_id}", response_model=SessionResponse)
def update_session(
    session_id: str,
    session_update: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_update.title is not None:
        session.title = session_update.title
    if session_update.status is not None:
        session.status = session_update.status
    if session_update.duration_seconds is not None:
        session.duration_seconds = session_update.duration_seconds
    if session_update.summary is not None:
        session.summary = session_update.summary

    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(session)
    db.commit()
    return None


@router.get("/{session_id}/transcript", response_model=List[TranscriptSegmentResponse])
def get_transcript(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    transcripts = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.session_id == session_id)
        .order_by(TranscriptSegment.created_at.asc())
        .all()
    )
    return transcripts


@router.post("/{session_id}/transcript", response_model=TranscriptSegmentResponse)
def append_transcript_segment(
    session_id: str,
    segment_in: TranscriptSegmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    segment = TranscriptSegment(
        session_id=session_id,
        source=segment_in.source,
        text=segment_in.text,
        is_final=segment_in.is_final,
        start_time=segment_in.start_time,
        end_time=segment_in.end_time,
    )
    db.add(segment)
    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(segment)
    return segment


@router.post("/{session_id}/continue", response_model=SessionDetailResponse)
def continue_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Continues an existing session.
    Verifies user isolation, retrieves context, updates session state,
    and returns full session details for immediate resumption without duplicate session creation.
    """
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "recording"
    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    return get_session(session_id=session_id, db=db, current_user=current_user)


@router.get("/{session_id}/export")
def export_session(
    session_id: str,
    format: str = Query("markdown", pattern="^(markdown|json)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if format == "markdown":
        content = ConversationMemory.export_session_markdown(db, session_id)
        filename = f"echomind_{session.id[:8]}_{session.title[:20].replace(' ', '_')}.md"
        return PlainTextResponse(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    else:
        # JSON format
        detail = get_session(session_id=session_id, db=db, current_user=current_user)
        return detail
