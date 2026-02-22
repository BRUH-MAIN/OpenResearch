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
    
    # Groq API
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"

    # Deep research search configuration
    server_url: str = "http://localhost:3001"

    # MCP servers (JSON mapping of server_name -> base_url)
    mcp_server_urls: str = ""
    mcp_request_timeout: int = 30
    
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
