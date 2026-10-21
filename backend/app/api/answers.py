import time
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import SessionModel, DetectedQuestion, AIAnswer, UserSettings, User
from app.schemas.schemas import AnswerRequest, AIAnswerResponse
from app.api.deps import get_current_user
from app.services.ai_providers import get_ai_provider
from app.services.memory import ConversationMemory

logger = logging.getLogger("echomind.answers_api")
router = APIRouter(prefix="/sessions", tags=["Answers"])


def build_answer_prompt(
    question_text: str,
    context: Optional[str],
    memory_context: str,
    answer_length: str = "concise"
) -> list[dict[str, str]]:
    length_guidelines = {
        "concise": "Provide a direct, high-impact, concise answer (2-4 sentences max). Be authoritative and precise.",
        "detailed": "Provide a comprehensive, in-depth explanation with structural rationale, examples, and nuances.",
        "bullet_points": "Provide a clear, structured response formatted as concise bullet points with bold keywords."
    }
    guideline = length_guidelines.get(answer_length, length_guidelines["concise"])

    system_prompt = f"""You are EchoMind AI, an elite real-time conversation assistant built for Hacktoberfest 2026.
Your role is to answer questions asked during live discussions, meetings, and audio streams.

Instructions:
1. {guideline}
2. Use the provided conversation context and transcript history to formulate a grounded, context-aware answer.
3. If the user refers to something said earlier in the conversation (e.g. "which of the two options?", "what did they say about the budget?"), leverage the transcript context directly.
4. If technical, be architecturally rigorous and modern.
5. Avoid repetitive filler phrases like "Sure, I can help with that!". Dive straight into the answer.
"""

    user_content = f"Question: {question_text}"
    if context:
        user_content += f"\n\nImmediate Context:\n{context}"
    if memory_context:
        user_content += f"\n\nRecent Conversation History:\n{memory_context}"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]


@router.post("/{session_id}/answers")
async def generate_answer(
    session_id: str,
    req: AnswerRequest,
    stream: bool = Query(True, description="Whether to stream the answer using Server-Sent Events"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get user settings
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    provider_name = req.provider or (user_settings.ai_provider if user_settings else "openrouter")
    model_name = req.model or (user_settings.ai_model if user_settings else "meta-llama/llama-3.1-8b-instruct")
    answer_length = req.answer_length or (user_settings.answer_length if user_settings else "concise")

    api_key = None
    if user_settings:
        if provider_name == "backboard":
            api_key = user_settings.backboard_api_key
        else:
            api_key = user_settings.openrouter_api_key

    provider = get_ai_provider(provider_name=provider_name, api_key=api_key)

    # Fetch conversation memory
    memory = ConversationMemory.get_session_context(db, session_id=session_id)
    messages = build_answer_prompt(
        question_text=req.question_text,
        context=req.context,
        memory_context=memory["transcript_context"],
        answer_length=answer_length
    )

    start_time = time.time()

    if stream:
        async def event_generator():
            accumulated_tokens: list[str] = []
            try:
                # Send metadata header first
                yield f"data: {json.dumps({'type': 'start', 'provider': provider_name, 'model': model_name})}\n\n"

                async for token in provider.stream_chat_completion(messages=messages, model=model_name):
                    accumulated_tokens.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                total_latency = int((time.time() - start_time) * 1000)
                full_answer = "".join(accumulated_tokens)

                # Persist answer to database
                db_answer = AIAnswer(
                    session_id=session_id,
                    question_id=req.question_id,
                    provider=provider_name,
                    model=model_name,
                    answer_text=full_answer or "No answer produced.",
                    latency_ms=total_latency,
                    token_count=len(accumulated_tokens)
                )
                db.add(db_answer)
                db.commit()
                db.refresh(db_answer)

                yield f"data: {json.dumps({'type': 'done', 'answer_id': db_answer.id, 'latency_ms': total_latency})}\n\n"
            except Exception as e:
                logger.error(f"Error during streaming answer: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    else:
        # Non-streaming fallback
        try:
            full_text = await provider.generate_chat_completion(messages=messages, model=model_name)
        except Exception as e:
            full_text = f"AI Provider Notice: {str(e)}"

        total_latency = int((time.time() - start_time) * 1000)
        db_answer = AIAnswer(
            session_id=session_id,
            question_id=req.question_id,
            provider=provider_name,
            model=model_name,
            answer_text=full_text,
            latency_ms=total_latency,
        )
        db.add(db_answer)
        db.commit()
        db.refresh(db_answer)

        return AIAnswerResponse.model_validate(db_answer)
