from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "EchoMind AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production-min-32-chars-long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = "sqlite:///./echomind.db"
    
    # AI Providers
    AI_PROVIDER: str = "openrouter"  # "openrouter" | "backboard"
    AI_MODEL: str = "meta-llama/llama-3.1-8b-instruct"
    BACKBOARD_API_KEY: str = ""
    BACKBOARD_API_BASE: str = "https://app.backboard.io/api"
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_API_BASE: str = "https://openrouter.ai/api/v1"
    
    # STT Settings
    STT_MODE: str = "lightweight"  # "lightweight" | "demo" | "faster-whisper"
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://echomind-ai.onrender.com",
        "https://echomind-ai-frontend-mwcb.onrender.com"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
