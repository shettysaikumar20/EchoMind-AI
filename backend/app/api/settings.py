from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import UserSettings, User
from app.schemas.schemas import SettingsResponse, SettingsUpdate, ProvidersResponse, ModelOption
from app.api.deps import get_current_user
from app.core.config import settings
from app.services.ai_providers import VERIFIED_OPEN_WEIGHT_MODELS

router = APIRouter(tags=["Settings"])


@router.get("/settings", response_model=SettingsResponse)
def get_user_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not user_settings:
        user_settings = UserSettings(
            user_id=current_user.id,
            ai_provider=settings.AI_PROVIDER,
            ai_model=settings.AI_MODEL,
        )
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)

    return SettingsResponse(
        ai_provider=user_settings.ai_provider,
        ai_model=user_settings.ai_model,
        has_backboard_key=bool(user_settings.backboard_api_key or settings.BACKBOARD_API_KEY),
        has_openrouter_key=bool(user_settings.openrouter_api_key or settings.OPENROUTER_API_KEY),
        answer_length=user_settings.answer_length,
        stt_mode=user_settings.stt_mode,
        retention_days=user_settings.retention_days,
    )


@router.patch("/settings", response_model=SettingsResponse)
def update_user_settings(
    settings_in: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not user_settings:
        user_settings = UserSettings(user_id=current_user.id)
        db.add(user_settings)

    if settings_in.ai_provider is not None:
        user_settings.ai_provider = settings_in.ai_provider
    if settings_in.ai_model is not None:
        user_settings.ai_model = settings_in.ai_model
    if settings_in.backboard_api_key is not None:
        user_settings.backboard_api_key = settings_in.backboard_api_key
    if settings_in.openrouter_api_key is not None:
        user_settings.openrouter_api_key = settings_in.openrouter_api_key
    if settings_in.answer_length is not None:
        user_settings.answer_length = settings_in.answer_length
    if settings_in.stt_mode is not None:
        user_settings.stt_mode = settings_in.stt_mode
    if settings_in.retention_days is not None:
        user_settings.retention_days = settings_in.retention_days

    user_settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_settings)

    return SettingsResponse(
        ai_provider=user_settings.ai_provider,
        ai_model=user_settings.ai_model,
        has_backboard_key=bool(user_settings.backboard_api_key or settings.BACKBOARD_API_KEY),
        has_openrouter_key=bool(user_settings.openrouter_api_key or settings.OPENROUTER_API_KEY),
        answer_length=user_settings.answer_length,
        stt_mode=user_settings.stt_mode,
        retention_days=user_settings.retention_days,
    )


@router.get("/providers", response_model=ProvidersResponse)
def get_providers():
    models = [ModelOption(**m) for m in VERIFIED_OPEN_WEIGHT_MODELS]
    return ProvidersResponse(
        providers=["openrouter", "backboard"],
        default_provider=settings.AI_PROVIDER,
        models=models
    )
