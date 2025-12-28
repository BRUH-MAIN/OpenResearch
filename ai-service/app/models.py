"""Pydantic models for request/response schemas."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ============ Request Models ============

class ChatRequest(BaseModel):
    """Request for chat Q&A endpoint."""
    question: str = Field(..., min_length=1, max_length=2000, description="The question to ask")
    session_id: Optional[str] = Field(None, description="Session ID for context")
    user_id: Optional[str] = Field(None, description="User ID for personalization")
    include_papers: bool = Field(True, description="Include linked papers in context")
    max_context_messages: int = Field(30, ge=1, le=100, description="Max messages to include")


class SummarizeRequest(BaseModel):
    """Request for session summarization."""
    session_id: str = Field(..., description="Session ID to summarize")
    max_messages: int = Field(100, ge=1, le=500)


# ============ Response Models ============

class ChatResponse(BaseModel):
    """Response from chat Q&A endpoint."""
    answer: str
    sources: list[str] = Field(default_factory=list, description="Message IDs used as sources")
    model: str
    latency_ms: int
    context_messages_used: int = 0
    papers_used: int = 0


class SummaryResponse(BaseModel):
    """Response from summarization endpoint."""
    summary: str
    key_points: list[str]
    participant_count: int
    message_count: int
    model: str
    latency_ms: int


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    gemini_configured: bool
    database_connected: bool
    timestamp: datetime


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    detail: Optional[str] = None
