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
    groq_model: str = "llama-3.3-70b-versatile"

    # Deep research model routing (Open Deep Research style)
    summarization_model: str = "gpt-oss-120b"
    research_model: str = "gpt-oss-120b"
    compression_model: str = "gpt-oss-120b"
    final_report_model: str = "gpt-oss-120b"

    # Deep research search configuration
    search_api: str = "tavily"  # options: tavily, mcp, vector_store, hybrid
    mcp_search_server: str = "academic_papers"
    mcp_search_tool: str = "search_arxiv"
    max_search_queries: int = 5
    max_search_results: int = 20
    max_source_summaries: int = 10

    # Tavily Search
    tavily_api_key: str = ""
    tavily_search_depth: str = "advanced"  # basic | advanced
    tavily_include_answer: bool = False
    
    # Database (read-only access to main DB for context)
    database_url: str = ""

    # Mem0 memory
    mem0_enabled: bool = True
    mem0_database_url: str = ""
    mem0_collection: str = "openresearch_memories"
    
    # Service URLs
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
