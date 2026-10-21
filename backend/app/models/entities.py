import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Float, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(100), default="EchoMind Explorer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)

    sessions = relationship("SessionModel", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")


class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String(255), default="Untitled Conversation")
    capture_mode = Column(String(20), default="mic")  # mic, tab, dual
    status = Column(String(20), default="idle")  # idle, recording, paused, stopped
    duration_seconds = Column(Float, default=0.0)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, index=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="sessions")
    transcripts = relationship("TranscriptSegment", back_populates="session", cascade="all, delete-orphan", order_by="TranscriptSegment.created_at")
    questions = relationship("DetectedQuestion", back_populates="session", cascade="all, delete-orphan", order_by="DetectedQuestion.question_index")
    answers = relationship("AIAnswer", back_populates="session", cascade="all, delete-orphan", order_by="AIAnswer.created_at")

    __table_args__ = (
        Index("ix_sessions_user_created", "user_id", "created_at"),
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id"), index=True, nullable=False)
    source = Column(String(20), default="mic")  # mic, tab, combined
    text = Column(Text, nullable=False)
    is_final = Column(Boolean, default=True)
    start_time = Column(Float, default=0.0)
    end_time = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utc_now, index=True)

    session = relationship("SessionModel", back_populates="transcripts")


class DetectedQuestion(Base):
    __tablename__ = "detected_questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id"), index=True, nullable=False)
    question_text = Column(Text, nullable=False)
    context_snippet = Column(Text, nullable=True)
    question_index = Column(Integer, default=1)
    detected_at = Column(DateTime, default=utc_now)

    session = relationship("SessionModel", back_populates="questions")
    answers = relationship("AIAnswer", back_populates="question", cascade="all, delete-orphan")


class AIAnswer(Base):
    __tablename__ = "ai_answers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id"), index=True, nullable=False)
    question_id = Column(String(36), ForeignKey("detected_questions.id"), nullable=True)
    provider = Column(String(50), default="openrouter")  # openrouter, backboard
    model = Column(String(100), default="meta-llama/llama-3.1-8b-instruct")
    answer_text = Column(Text, nullable=False)
    latency_ms = Column(Integer, default=0)
    token_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    session = relationship("SessionModel", back_populates="answers")
    question = relationship("DetectedQuestion", back_populates="answers")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    ai_provider = Column(String(50), default="openrouter")
    ai_model = Column(String(100), default="meta-llama/llama-3.1-8b-instruct")
    backboard_api_key = Column(String(255), nullable=True)
    openrouter_api_key = Column(String(255), nullable=True)
    answer_length = Column(String(20), default="concise")  # concise, detailed, bullet_points
    stt_mode = Column(String(20), default="lightweight")
    retention_days = Column(Integer, default=30)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="settings")
