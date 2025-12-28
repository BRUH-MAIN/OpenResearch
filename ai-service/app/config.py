"""Configuration for the AI service."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # API Configuration
    app_name: str = "OpenResearch AI Service"
    debug: bool = False
    
    # Gemini API
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    
    # Database (read-only access to main DB for context)
    database_url: str = ""
    
    # Service URLs
    server_url: str = "http://localhost:3001"
    
    # Rate limiting
    max_context_messages: int = 50
    max_context_tokens: int = 8000
    request_timeout: int = 30
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
