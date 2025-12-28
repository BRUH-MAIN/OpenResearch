"""
OpenResearch AI Service - FastAPI Application

A minimal async FastAPI service for AI-powered features:
- Chat Q&A with session context
- Session summarization
- Health checks
"""

from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import (
    ChatRequest,
    ChatResponse,
    SummarizeRequest,
    SummaryResponse,
    HealthResponse,
    ErrorResponse,
)
from .gemini_client import gemini_client
from .database import database


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    settings = get_settings()
    print(f"🚀 Starting {settings.app_name}")
    
    # Initialize Gemini
    if gemini_client.initialize():
        print("✅ Gemini AI client initialized")
    else:
        print("⚠️  Gemini API key not configured - AI features will return errors")
    
    # Initialize database
    if await database.connect():
        print("✅ Database connected")
    else:
        print("⚠️  Database not connected - context features limited")
    
    yield
    
    # Shutdown
    await database.disconnect()
    print("👋 AI Service shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="OpenResearch AI Service",
    description="AI-powered features for the OpenResearch collaboration platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Health Check ============

@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Health"],
    summary="Check service health",
)
async def health_check():
    """Check the health of the AI service and its dependencies."""
    return HealthResponse(
        status="healthy",
        gemini_configured=gemini_client.is_configured,
        database_connected=database.is_connected,
        timestamp=datetime.utcnow(),
    )


# ============ Chat Q&A ============

@app.post(
    "/chat",
    response_model=ChatResponse,
    responses={
        503: {"model": ErrorResponse, "description": "AI service not configured"},
        404: {"model": ErrorResponse, "description": "Session not found"},
    },
    tags=["Chat"],
    summary="Ask a question with session context",
)
async def chat_qa(request: ChatRequest):
    """
    Ask a question and get an AI-powered answer based on session context.
    
    The AI uses:
    - Recent messages from the session
    - Papers linked to the session
    - Session title and context
    
    Returns an answer with references to source messages.
    """
    if not gemini_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Please set GEMINI_API_KEY.",
        )
    
    # Fetch context
    session_title = "Research Discussion"
    context_messages = []
    papers = []
    
    if request.session_id and database.is_connected:
        # Get session info
        session_info = await database.get_session_info(request.session_id)
        if session_info:
            session_title = session_info.get("title", session_title)
        
        # Get messages
        context_messages = await database.get_session_messages(
            request.session_id,
            limit=request.max_context_messages,
        )
        
        # Get papers if requested
        if request.include_papers:
            papers = await database.get_session_papers(request.session_id)
    
    try:
        answer, sources, latency_ms = await gemini_client.chat_qa(
            question=request.question,
            context_messages=context_messages,
            papers=papers,
            session_title=session_title,
        )
        
        return ChatResponse(
            answer=answer,
            sources=sources,
            model=gemini_client.model_name,
            latency_ms=latency_ms,
            context_messages_used=len(context_messages),
            papers_used=len(papers),
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )


# ============ Session Summarization ============

@app.post(
    "/summarize",
    response_model=SummaryResponse,
    responses={
        503: {"model": ErrorResponse, "description": "AI service not configured"},
        404: {"model": ErrorResponse, "description": "Session not found"},
        400: {"model": ErrorResponse, "description": "No messages to summarize"},
    },
    tags=["Summarization"],
    summary="Generate a session summary",
)
async def summarize_session(request: SummarizeRequest):
    """
    Generate a summary of a session's discussion.
    
    Returns:
    - A concise summary (2-3 paragraphs)
    - Key points (max 5)
    - Participant and message counts
    """
    if not gemini_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Please set GEMINI_API_KEY.",
        )
    
    if not database.is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not connected. Cannot fetch session messages.",
        )
    
    # Get session info
    session_info = await database.get_session_info(request.session_id)
    if not session_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    
    # Get messages
    messages = await database.get_session_messages(
        request.session_id,
        limit=request.max_messages,
    )
    
    if not messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No messages in session to summarize.",
        )
    
    # Count participants
    participants = set(
        msg["user_name"]
        for msg in messages
        if msg.get("type") == "user" and msg.get("user_name")
    )
    
    try:
        summary, key_points, latency_ms = await gemini_client.summarize_session(
            messages=messages,
            session_title=session_info.get("title", "Research Session"),
        )
        
        return SummaryResponse(
            summary=summary,
            key_points=key_points,
            participant_count=len(participants),
            message_count=len(messages),
            model=gemini_client.model_name,
            latency_ms=latency_ms,
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )


# ============ Simple test endpoint ============

@app.post(
    "/test",
    tags=["Testing"],
    summary="Test AI generation without context",
)
async def test_generation(question: str = "What is machine learning?"):
    """
    Simple test endpoint to verify Gemini is working.
    No database or session context required.
    """
    if not gemini_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Please set GEMINI_API_KEY.",
        )
    
    try:
        response, latency_ms = await gemini_client.generate(
            prompt=question,
            system_instruction="You are a helpful AI assistant. Be concise.",
            temperature=0.7,
            max_tokens=256,
        )
        
        return {
            "question": question,
            "answer": response,
            "model": gemini_client.model_name,
            "latency_ms": latency_ms,
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )
