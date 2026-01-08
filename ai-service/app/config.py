"""Configuration for the AI service."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# Get the directory where this config file is located
CONFIG_DIR = Path(__file__).parent.parent
ENV_FILE = CONFIG_DIR / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # API Configuration
    app_name: str = "OpenResearch AI Service"
    debug: bool = False
    
    # Gemini API - using new Google GenAI SDK
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3-flash-preview"
    
    # Database (read-only access to main DB for context)
    database_url: str = ""
    
    # Service URLs
    server_url: str = "http://localhost:3001"
    
    # Rate limiting
    max_context_messages: int = 50
    max_context_tokens: int = 8000
    request_timeout: int = 30
    
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore extra environment variables
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
