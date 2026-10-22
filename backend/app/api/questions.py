import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.entities import SessionModel, TranscriptSegment, DetectedQuestion, UserSettings, User
from app.schemas.schemas import QuestionDetectionResult, QuestionItem, QuestionCreate, QuestionWithAnswerResponse
from app.api.deps import get_current_user
from app.services.question_detector import detect_questions_from_transcript

logger = logging.getLogger("echomind.questions_api")
router = APIRouter(prefix="/sessions", tags=["Questions"])


@router.post("/{session_id}/questions/detect", response_model=QuestionDetectionResult)
async def detect_questions(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Triggered when user clicks Pause.
    Extracts all questions from the session's transcript, deduplicates against
    already saved questions, records new questions in the database, and returns them.
    """
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Fetch all finalized transcript segments
    transcripts = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.session_id == session_id)
        .order_by(TranscriptSegment.start_time.asc())
        .all()
    )

    if not transcripts:
        return QuestionDetectionResult(
            questions=[],
            processed_segment_count=0,
            message="No transcripts available for question detection."
        )

    # Combine transcripts
    full_text = "\n".join([f"{t.text}" for t in transcripts if t.text.strip()])

    # Fetch user AI settings
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    provider = user_settings.ai_provider if user_settings else None
    model = user_settings.ai_model if user_settings else None
    api_key = None
    if user_settings:
        if provider == "backboard":
            api_key = user_settings.backboard_api_key.strip() if user_settings.backboard_api_key and user_settings.backboard_api_key.strip() else None
        else:
            api_key = user_settings.openrouter_api_key.strip() if user_settings.openrouter_api_key and user_settings.openrouter_api_key.strip() else None

    # Run AI question detection
    detection_result = await detect_questions_from_transcript(
        transcript_text=full_text,
        provider_name=provider,
        api_key=api_key,
        model=model
    )

    # Fetch existing questions to deduplicate and preserve indexes
    existing_questions = (
        db.query(DetectedQuestion)
        .filter(DetectedQuestion.session_id == session_id)
        .all()
    )
    existing_texts = {q.question_text.lower().strip() for q in existing_questions}
    max_index = (
        db.query(func.max(DetectedQuestion.question_index))
        .filter(DetectedQuestion.session_id == session_id)
        .scalar() or 0
    )

    new_saved_questions: list[QuestionItem] = []
    next_idx = max_index + 1

    for q in detection_result.questions:
        clean_text = q.question_text.strip()
        if clean_text.lower() not in existing_texts:
            existing_texts.add(clean_text.lower())
            
            db_question = DetectedQuestion(
                session_id=session_id,
                question_text=clean_text,
                context_snippet=q.context_snippet,
                question_index=next_idx
            )
            db.add(db_question)
            db.flush()
            new_saved_questions.append(QuestionItem(
                id=db_question.id,
                question_text=clean_text,
                context_snippet=q.context_snippet,
                question_index=next_idx
            ))
            next_idx += 1

    if new_saved_questions:
        db.commit()

    return QuestionDetectionResult(
        questions=new_saved_questions,
        processed_segment_count=len(transcripts),
        message=f"Detected {len(new_saved_questions)} new question(s)." if new_saved_questions else "No new questions detected."
    )


@router.post("/{session_id}/questions", response_model=QuestionWithAnswerResponse)
async def create_question(
    session_id: str,
    req: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Directly adds a new question to a session and persists it in SQLite,
    guaranteeing it never disappears.
    """
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    clean_text = req.question_text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Question text cannot be empty")

    max_idx = (
        db.query(func.max(DetectedQuestion.question_index))
        .filter(DetectedQuestion.session_id == session_id)
        .scalar() or 0
    )

    db_question = DetectedQuestion(
        session_id=session_id,
        question_text=clean_text,
        context_snippet=req.context_snippet,
        question_index=max_idx + 1
    )
    db.add(db_question)
    db.commit()
    db.refresh(db_question)

    return QuestionWithAnswerResponse(
        id=db_question.id,
        session_id=db_question.session_id,
        question_text=db_question.question_text,
        context_snippet=db_question.context_snippet,
        question_index=db_question.question_index,
        detected_at=db_question.detected_at,
        answers=[]
    )
