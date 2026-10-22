from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


# --- User & Auth Schemas ---
class UserBase(BaseModel):
    email: str
    name: Optional[str] = "EchoMind Explorer"


class UserRegister(UserBase):
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- Transcript Schemas ---
class TranscriptSegmentCreate(BaseModel):
    source: str = "mic"  # mic, tab, combined
    text: str
    is_final: bool = True
    start_time: float = 0.0
    end_time: float = 0.0


class TranscriptSegmentResponse(BaseModel):
    id: str
    session_id: str
    source: str
    text: str
    is_final: bool
    start_time: float
    end_time: float
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Question & Answer Schemas ---
class QuestionItem(BaseModel):
    id: Optional[str] = Field(None, description="Database unique identifier if persisted")
    question_text: str = Field(..., description="Preserved wording of the detected question")
    context_snippet: Optional[str] = Field(None, description="Relevant surrounding context from conversation")
    question_index: int = Field(1, description="Sequential number of the question")


class QuestionCreate(BaseModel):
    question_text: str = Field(..., description="Wording of question to add")
    context_snippet: Optional[str] = Field(None, description="Context from speech or notes")


class QuestionDetectionResult(BaseModel):
    questions: List[QuestionItem] = Field(default_factory=list)
    processed_segment_count: int = 0
    message: Optional[str] = None


class DetectedQuestionResponse(BaseModel):
    id: str
    session_id: str
    question_text: str
    context_snippet: Optional[str]
    question_index: int
    detected_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AIAnswerResponse(BaseModel):
    id: str
    session_id: str
    question_id: Optional[str]
    provider: str
    model: str
    answer_text: str
    latency_ms: int
    token_count: Optional[int]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class QuestionWithAnswerResponse(DetectedQuestionResponse):
    answers: List[AIAnswerResponse] = Field(default_factory=list)


class AnswerRequest(BaseModel):
    session_id: str
    question_id: Optional[str] = None
    question_text: str
    context: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    answer_length: Optional[str] = None  # concise, detailed, bullet_points


# --- Session Schemas ---
class SessionCreate(BaseModel):
    title: Optional[str] = "Untitled Conversation"
    capture_mode: Optional[str] = "mic"  # mic, tab, dual


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None  # idle, recording, paused, stopped
    duration_seconds: Optional[float] = None
    summary: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    user_id: str
    title: str
    capture_mode: str
    status: str
    duration_seconds: float
    summary: Optional[str]
    created_at: datetime
    updated_at: datetime
    question_count: int = 0
    answer_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class SessionDetailResponse(SessionResponse):
    transcripts: List[TranscriptSegmentResponse] = Field(default_factory=list)
    questions: List[QuestionWithAnswerResponse] = Field(default_factory=list)


# --- Settings Schemas ---
class SettingsResponse(BaseModel):
    ai_provider: str
    ai_model: str
    has_backboard_key: bool
    has_openrouter_key: bool
    answer_length: str
    stt_mode: str
    retention_days: int
    model_config = ConfigDict(from_attributes=True)


class SettingsUpdate(BaseModel):
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    backboard_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    answer_length: Optional[str] = None
    stt_mode: Optional[str] = None
    retention_days: Optional[int] = None


# --- Providers & Models ---
class ModelOption(BaseModel):
    id: str
    name: str
    provider: str
    description: str
    is_open_weight: bool = True
    context_length: int = 8192
    recommended: bool = False


class ProvidersResponse(BaseModel):
    providers: List[str]
    default_provider: str
    models: List[ModelOption]
