"""Pydantic models for request/response schemas."""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal, Any
from datetime import datetime


class GroupAIChatRequest(BaseModel):
    """Request for group AI chat - requires @ai trigger."""
    prompt: str = Field(..., min_length=3, max_length=5000, description="Prompt with @ai trigger")
    group_id: Optional[str] = Field(None, description="Group ID for context isolation (also taken from path)")
    session_id: Optional[str] = Field(None, description="Session ID for context")
    user_id: Optional[str] = Field(None, description="User ID")
    
    @field_validator('prompt')
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        if '@ai' not in v.lower():
            raise ValueError("Prompt must contain @ai trigger. AI only responds when triggered by @ai.")
        return v


class AgentRunRequest(BaseModel):
    """Request for the research agent.

    Deliberately has no @ai validator. The trigger for the agent is the explicit
    act of invoking it — a dedicated button and a dedicated endpoint — not a
    mention inside a chat message. The invariant the @ai gate protects is "no AI
    activity without explicit user intent", and pressing "Deep research" satisfies
    that as squarely as typing @ai does. Requiring both would be theatre.
    """
    prompt: str = Field(..., min_length=10, max_length=2000, description="What to investigate")
    group_id: Optional[str] = Field(None, description="Group ID for context isolation")
    session_id: Optional[str] = Field(None, description="Session ID for context")
    user_id: Optional[str] = Field(None, description="User ID")


class PaperQuestionRequest(BaseModel):
    """Request for paper Q&A - requires @ai trigger."""
    paper_id: str = Field(..., description="Paper ID to query")
    question: str = Field(..., min_length=3, max_length=2000, description="Question with @ai trigger")
    group_id: str = Field(..., description="Group ID for context isolation")
    session_id: Optional[str] = Field(None, description="Session ID")
    user_id: str = Field(..., description="User ID")
    
    @field_validator('question')
    @classmethod
    def validate_question(cls, v: str) -> str:
        if '@ai' not in v.lower():
            raise ValueError("Question must contain @ai trigger. AI only responds when triggered by @ai.")
        return v


class PaperSummarizeRequest(BaseModel):
    """Request for paper summarization - requires @ai trigger."""
    paper_id: str = Field(..., description="Paper ID to summarize")
    group_id: str = Field(..., description="Group ID for context isolation")
    session_id: Optional[str] = Field(None, description="Session ID")
    user_id: str = Field(..., description="User ID")
    trigger: str = Field("@ai summarize", description="Must contain @ai")
    
    @field_validator('trigger')
    @classmethod
    def validate_trigger(cls, v: str) -> str:
        if '@ai' not in v.lower():
            raise ValueError("Trigger must contain @ai. AI only responds when triggered by @ai.")
        return v


class AddPaperToGroupRequest(BaseModel):
    """Request to add paper to group and embed."""
    paper_id: str = Field(..., description="Paper ID")
    group_id: str = Field(..., description="Group ID")
    user_id: str = Field(..., description="User adding the paper")
    title: str = Field(..., description="Paper title")
    abstract: str = Field(..., description="Paper abstract")
    full_text: Optional[str] = Field(None, description="Full paper text if available")
    metadata: Optional[dict] = Field(None, description="Additional metadata")


class GenerateReportRequest(BaseModel):
    """Request for group report generation."""
    group_id: str = Field(..., description="Group ID")
    user_id: str = Field(..., description="User generating report")
    include_sessions: bool = Field(True, description="Include session messages")
    include_papers: bool = Field(True, description="Include group papers")
    include_summaries: bool = Field(True, description="Include AI summaries")
    prompt: Optional[str] = Field(None, description="Custom prompt with @ai trigger")
    
    @field_validator('prompt')
    @classmethod
    def validate_prompt(cls, v: Optional[str]) -> Optional[str]:
        if v and '@ai' not in v.lower():
            raise ValueError("Custom prompt must contain @ai trigger if provided.")
        return v


class VectorSearchRequest(BaseModel):
    """Request for vector similarity search."""
    group_id: str = Field(..., description="Group ID (required for isolation)")
    query: str = Field(..., min_length=1, max_length=1000, description="Search query")
    limit: int = Field(10, ge=1, le=50, description="Max results")
    content_types: Optional[list[str]] = Field(None, description="Filter by content types")
    paper_id: Optional[str] = Field(None, description="Filter by paper ID")


class GroupAIChatResponse(BaseModel):
    """Response from group AI chat."""
    id: str
    text: str
    metadata: dict = Field(default_factory=dict)
    sources: list[dict] = Field(default_factory=list, description="Retrieved context sources")
    latency_ms: int


class PaperAnswerResponse(BaseModel):
    """Response from paper Q&A."""
    id: str
    answer: str
    paper_id: str
    sources: list[dict] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    latency_ms: int


class PaperSummaryResponse(BaseModel):
    """Response from paper summarization."""
    id: str
    summary: str
    key_points: list[str]
    paper_id: str
    metadata: dict = Field(default_factory=dict)
    latency_ms: int


class AddPaperResponse(BaseModel):
    """Response from adding paper to group."""
    success: bool
    paper_id: str
    group_id: str
    vectors_created: int
    message: str


class ReportResponse(BaseModel):
    """Response from report generation."""
    id: str
    url: str
    filename: str
    file_size: int
    group_id: str
    created_at: datetime


class VectorSearchResponse(BaseModel):
    """Response from vector search."""
    results: list[dict]
    total: int
    group_id: str
    latency_ms: int


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    llm_configured: bool
    database_connected: bool
    vector_store_connected: bool = False
    timestamp: datetime


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None
