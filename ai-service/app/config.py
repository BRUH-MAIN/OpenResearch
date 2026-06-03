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
    # Database Configuration
    database_url: str = ""
    
    # DeepSeek API (primary LLM provider)
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com/v1"

    # Groq API (fallback LLM provider)
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    groq_available_models: list[str] = [
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "llama-3.1-70b-versatile",
        "gemma2-9b-it",
        "mixtral-8x7b-32768",
    ]

    # LLM provider selection: "deepseek" (default) or "groq"
    llm_provider: str = "deepseek"

    # Web Search (Tavily)
    tavily_api_key: str = ""

    # Deep research search configuration
    server_url: str = "http://localhost:3001"

    # MCP servers (JSON mapping of server_name -> base_url)
    mcp_server_urls: str = ""
    mcp_request_timeout: int = 30
    
    # Rate limiting
    max_context_messages: int = 50
    max_context_tokens: int = 10000
    request_timeout: int = 30

    # RAG pipeline
    rag_chunks_per_query: int = 3  # chunks retrieved per sub-query
    rag_similarity_threshold: float = 0.65  # min cosine similarity to keep a chunk
    rag_max_context_chunks: int = 15  # max chunks sent to the LLM
    rag_reranker_top_k: int = 15  # max items kept after cross-encoder reranking
    rag_reranker_score_threshold: float = 0.01  # min reranker score to keep
    rag_relevance_filter_max_items: int = 30  # max items evaluated by LLM relevance filter

    # Logging
    log_max_bytes: int = 10 * 1024 * 1024  # 10 MB
    log_backup_count: int = 5

    # Mem0 memory adapter
    mem0_enabled: bool = False
    mem0_database_url: str = ""
    
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore extra environment variables
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
