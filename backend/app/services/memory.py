from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.entities import SessionModel, TranscriptSegment, DetectedQuestion, AIAnswer


class ConversationMemory:
    """
    Manages conversation context retrieval, semantic context assembly,
    and history export for persistent session continuity.
    """

    @staticmethod
    def get_session_context(
        db: Session,
        session_id: str,
        max_transcript_chars: int = 4000,
        max_qa_pairs: int = 5
    ) -> Dict[str, Any]:
        """
        Retrieves formatted conversation memory to feed into AI reasoning prompts.
        """
        # 1. Fetch recent finalized transcripts
        transcripts = (
            db.query(TranscriptSegment)
            .filter(TranscriptSegment.session_id == session_id, TranscriptSegment.is_final == True)
            .order_by(TranscriptSegment.created_at.desc())
            .limit(25)
            .all()
        )
        # Reverse to chronological order
        transcripts = list(reversed(transcripts))
        
        transcript_lines = []
        char_count = 0
        for t in reversed(transcripts):
            line = f"[{t.source.upper()} - {t.start_time:.1f}s]: {t.text}"
            if char_count + len(line) > max_transcript_chars:
                break
            transcript_lines.insert(0, line)
            char_count += len(line)

        # 2. Fetch past Q&A pairs in this session
        questions = (
            db.query(DetectedQuestion)
            .filter(DetectedQuestion.session_id == session_id)
            .order_by(DetectedQuestion.question_index.desc())
            .limit(max_qa_pairs)
            .all()
        )
        questions = list(reversed(questions))

        qa_history = []
        for q in questions:
            ans = (
                db.query(AIAnswer)
                .filter(AIAnswer.question_id == q.id)
                .order_by(AIAnswer.created_at.desc())
                .first()
            )
            qa_history.append({
                "question": q.question_text,
                "answer": ans.answer_text if ans else "Unanswered",
                "index": q.question_index
            })

        return {
            "transcript_context": "\n".join(transcript_lines),
            "qa_history": qa_history,
            "transcript_count": len(transcripts),
            "qa_count": len(qa_history)
        }

    @staticmethod
    def export_session_markdown(db: Session, session_id: str) -> str:
        """Exports the complete session transcript and Q&A history as clean Markdown."""
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            return "# Session Not Found"

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

        md = []
        md.append(f"# EchoMind AI Session: {session.title}")
        md.append(f"**Date:** {session.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}  ")
        md.append(f"**Capture Mode:** {session.capture_mode.upper()}  ")
        md.append(f"**Duration:** {session.duration_seconds:.1f} seconds  ")
        md.append(f"**Status:** {session.status.capitalize()}\n")

        if session.summary:
            md.append("## Executive Summary\n")
            md.append(f"{session.summary}\n")

        md.append("## Detected Questions & AI Answers\n")
        if not questions:
            md.append("*No questions were detected during this session.*\n")
        else:
            for q in questions:
                md.append(f"### Q{q.question_index}: {q.question_text}")
                if q.context_snippet:
                    md.append(f"> *Context:* {q.context_snippet}\n")
                
                answers = db.query(AIAnswer).filter(AIAnswer.question_id == q.id).all()
                if answers:
                    for a in answers:
                        md.append(f"**Answer ({a.provider} / {a.model}):**\n")
                        md.append(f"{a.answer_text}\n")
                else:
                    md.append("*No answer recorded.*\n")

        md.append("## Full Transcript\n")
        if not transcripts:
            md.append("*No transcript segments recorded.*\n")
        else:
            for t in transcripts:
                prefix = f"**[{t.source.upper()} {t.start_time:.1f}s - {t.end_time:.1f}s]:**"
                md.append(f"- {prefix} {t.text}")

        return "\n".join(md)
