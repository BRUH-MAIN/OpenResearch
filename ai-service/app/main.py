"""
OpenResearch AI Service - FastAPI Application

A minimal async FastAPI service for AI-powered features:
- Group-isolated AI Chat with @ai trigger
- Paper Q&A with RAG
- Paper Summarization
- Session summarization
- Report Generation
- Vector store operations

CRITICAL RULES:
1. AI only responds when @ai trigger is present
2. All vector operations are group-isolated
3. No cross-group context retrieval
"""

import os
import time
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from .config import get_settings
from .models import (
    GroupAIChatRequest, GroupAIChatResponse,
    PaperQuestionRequest, PaperAnswerResponse,
    PaperSummarizeRequest, PaperSummaryResponse,
    AddPaperToGroupRequest, AddPaperResponse,
    GenerateReportRequest, ReportResponse,
    VectorSearchRequest, VectorSearchResponse,
    AgenticRunRequest, AgenticRunResponse,
    HealthResponse, ErrorResponse,
    IntentClassifyRequest, IntentClassifyResponse,
)
from .groq_client import groq_client
from .intent_classifier import classify_intent
from .database import database
from .embeddings import embedding_service
from .vector_store import vector_store
from .report_generator import report_generator
from .agentic import agentic_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    settings = get_settings()
    print(f"🚀 Starting {settings.app_name}")
    
    # Initialize Groq
    if groq_client.initialize():
        print("✅ Groq AI client initialized")
    else:
        print("⚠️  Groq API key not configured - AI features will return errors")
    
    # Initialize embedding service
    if embedding_service.initialize():
        print("✅ Embedding service initialized")
    else:
        print("⚠️  Embedding service not configured")
    
    # Initialize database
    if await database.connect():
        print("✅ Database connected")
    else:
        print("⚠️  Database not connected - context features limited")
    
    # Initialize vector store
    if await vector_store.connect():
        print("✅ Vector store connected")
    else:
        print("⚠️  Vector store not connected - RAG features limited")

    # Initialize agentic orchestration
    if agentic_service.initialize():
        print("✅ Agentic orchestration initialized")
    else:
        print("⚠️  Agentic orchestration not configured")
    
    # Create reports directory
    os.makedirs("./reports", exist_ok=True)
    
    yield
    
    # Shutdown
    await database.disconnect()
    await vector_store.disconnect()
    print("👋 AI Service shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="OpenResearch AI Service",
    description="AI-powered features for the OpenResearch collaboration platform. AI only responds when triggered by @ai.",
    version="2.0.0",
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


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    error_detail = str(exc)
    print(f"❌ Unhandled exception: {error_detail}")
    print(traceback.format_exc())
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": error_detail, "type": type(exc).__name__}
    )


# ============ Helper Functions ============

def validate_ai_trigger(text: str, field_name: str = "prompt") -> str:
    """Validate that text contains @ai trigger. Raises 400 if missing."""
    if not text or '@ai' not in text.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must contain @ai trigger. AI only responds when triggered by @ai."
        )
    return text


def validate_uuid(value: str, field_name: str = "id") -> str:
    """Validate UUID format. Raises 400 if invalid."""
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a valid UUID.",
        )
    return value


async def get_group_context(
    group_id: str,
    query: str,
    limit: int = 10,
    content_types: Optional[list[str]] = None
) -> tuple[list[dict], list[str]]:
    """
    Retrieve group-isolated context for RAG.
    
    Returns:
        Tuple of (context_items, vector_ids_used)
    """
    validate_uuid(group_id, "group_id")
    if not vector_store.is_connected:
        return [], []
    
    results = await vector_store.search_group_vectors(
        group_id=group_id,
        query=query,
        limit=limit,
        content_types=content_types
    )
    
    vector_ids = [r['id'] for r in results]
    return results, vector_ids


async def store_ai_artifact(
    group_id: str,
    artifact_type: str,
    content: str,
    prompt: Optional[str] = None,
    session_id: Optional[str] = None,
    paper_id: Optional[str] = None,
    user_id: Optional[str] = None,
    metadata: Optional[dict] = None
) -> Optional[str]:
    """Store AI artifact and its embedding in group namespace."""
    if not database.is_connected:
        return None
    
    # Store artifact
    artifact_id = await database.store_ai_artifact(
        group_id=group_id,
        artifact_type=artifact_type,
        content=content,
        prompt=prompt,
        session_id=session_id,
        paper_id=paper_id,
        user_id=user_id,
        metadata=metadata
    )
    
    if artifact_id and vector_store.is_connected:
        # Store embedding in group namespace
        await vector_store.insert_vector(
            group_id=group_id,
            paper_id=paper_id or "system",
            content=content,
            content_type=artifact_type,
            content_id=artifact_id,
            metadata={"artifact_type": artifact_type, **(metadata or {})}
        )
    
    return artifact_id


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
        groq_configured=groq_client.is_configured,
        database_connected=database.is_connected,
        vector_store_connected=vector_store.is_connected,
        timestamp=datetime.now(timezone.utc),
    )


# ============ Agentic Orchestration ============

@app.post(
    "/agentic/run",
    response_model=AgenticRunResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Agentic"],
    summary="Run agentic research task",
)
async def run_agentic_task(request: AgenticRunRequest):
    """Run an agentic task via LangGraph orchestration."""
    validate_ai_trigger(request.prompt, "prompt")

    if not groq_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Please set GROQ_API_KEY.",
        )

    try:
        response = await agentic_service.run_task(
            request.task_type,
            {
                "prompt": request.prompt,
                "group_id": request.group_id,
                "user_id": request.user_id,
                "session_id": request.session_id,
                "paper_ids": request.paper_ids,
                "options": request.options,
            },
        )

        return AgenticRunResponse(**response)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agentic task failed: {str(e)}",
        )

@app.post(
    "/agentic/stream",
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Agentic"],
    summary="Stream agentic research task events",
)
async def stream_agentic_task(request: AgenticRunRequest):
    """Stream an agentic task via LangGraph orchestration."""
    validate_ai_trigger(request.prompt, "prompt")

    if not groq_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Please set GROQ_API_KEY.",
        )

    return StreamingResponse(
        agentic_service.stream_task_events(
            request.task_type,
            {
                "prompt": request.prompt,
                "group_id": request.group_id,
                "user_id": request.user_id,
                "session_id": request.session_id,
                "paper_ids": request.paper_ids,
                "options": request.options,
            },
        ),
        media_type="application/x-ndjson",
    )

@app.post(
    "/agentic/classify-intent",
    response_model=IntentClassifyResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Agentic"],
    summary="Classify agentic intent using embeddings",
)
async def classify_agentic_intent(request: IntentClassifyRequest):
    """Classify a prompt into an agentic task using embedding similarity."""
    validate_ai_trigger(request.prompt, "prompt")

    if not embedding_service.is_configured:
        embedding_service.initialize()

    result = await classify_intent(request.prompt)
    return IntentClassifyResponse(**result)


# ============ Group AI Chat ============

@app.post(
    "/groups/{group_id}/ai-chat",
    response_model=GroupAIChatResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Group AI"],
    summary="Group AI chat with @ai trigger",
)
async def group_ai_chat(group_id: str, request: GroupAIChatRequest):
    """
    Process AI chat request for a group.
    
    CRITICAL: Requires @ai trigger in prompt. Uses group-isolated RAG context.
    """
    validate_uuid(group_id, "group_id")
    validate_uuid(request.group_id, "group_id")
    if request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
    # Validate @ai trigger
    validate_ai_trigger(request.prompt)
    
    if not groq_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Please set GROQ_API_KEY.",
        )
    
    start_time = time.time()
    
    # Extract query (remove @ai prefix)
    query = request.prompt.lower().replace('@ai', '').strip()
    
    # Get group-isolated context via RAG
    try:
        context_items, vector_ids = await get_group_context(
            group_id=group_id,
            query=query,
            limit=10,
            content_types=["paper", "qa", "summary", "memory"]
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    
    # Get session messages if provided
    session_messages = []
    if request.session_id and database.is_connected:
        session_messages = await database.get_session_messages(
            request.session_id,
            limit=30
        )
    
    # Get group memory notes
    memory_notes = []
    if database.is_connected:
        memory_notes = await database.get_group_memory_notes(group_id, limit=10)
    
    # Build context for LLM
    context_parts = []
    
    if context_items:
        rag_context = "\n".join([
            f"[{item['content_type'].upper()}] {item['content'][:500]}"
            for item in context_items
        ])
        context_parts.append(f"## Retrieved Context\n{rag_context}")
    
    if session_messages:
        messages_text = "\n".join([
            f"[{msg.get('user_name', 'Unknown')}]: {msg.get('content', '')}"
            for msg in session_messages[-10:]
        ])
        context_parts.append(f"## Recent Messages\n{messages_text}")
    
    if memory_notes:
        notes_text = "\n".join([
            f"[{note['note_type'].upper()}]: {note['content']}"
            for note in memory_notes
        ])
        context_parts.append(f"## Group Memory Notes\n{notes_text}")
    
    context = "\n\n".join(context_parts) if context_parts else "No context available."
    
    # Generate response
    system_instruction = """You are an AI research assistant for OpenResearch, a collaboration platform for research teams.
You help researchers by answering questions using the group's papers, discussion context, and memory notes.
Always cite sources when possible using [SOURCE_TYPE] references.
Be concise, accurate, and helpful. Use academic language appropriate for researchers."""

    prompt = f"""Group Context:
{context}

---

User Request: {request.prompt}

Provide a helpful response based on the group's context."""

    try:
        answer, latency_ms = await groq_client.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.5,
            max_tokens=2048,
        )
        
        # Store artifact
        artifact_id = await store_ai_artifact(
            group_id=group_id,
            artifact_type="chat_response",
            content=answer,
            prompt=request.prompt,
            session_id=request.session_id,
            user_id=request.user_id,
            metadata={
                "vector_ids_used": vector_ids,
                "context_items_count": len(context_items),
                "latency_ms": latency_ms
            }
        )
        
        total_latency = int((time.time() - start_time) * 1000)
        
        return GroupAIChatResponse(
            id=artifact_id or str(uuid.uuid4()),
            text=answer,
            metadata={
                "model": groq_client.model_name,
                "context_items_used": len(context_items),
                "vector_ids_used": vector_ids,
            },
            sources=[
                {"id": item['id'], "type": item['content_type'], "similarity": item['similarity']}
                for item in context_items[:5]
            ],
            latency_ms=total_latency
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )


# ============ Paper Q&A ============

@app.post(
    "/papers/question",
    response_model=PaperAnswerResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Papers"],
    summary="Ask a question about a paper",
)
async def paper_question(request: PaperQuestionRequest):
    """
    Answer a question about a specific paper.
    
    CRITICAL: Requires @ai trigger. Uses group-isolated paper context.
    """
    validate_uuid(request.group_id, "group_id")
    validate_ai_trigger(request.question, "question")
    
    if not groq_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured.",
        )
    
    start_time = time.time()
    
    query = request.question.lower().replace('@ai', '').strip()
    
    # Get paper context from group's vectors
    paper_context, vector_ids = await get_group_context(
        group_id=request.group_id,
        query=query,
        limit=10,
        content_types=["paper", "qa"]
    )
    
    # Filter to specific paper if specified
    paper_chunks = [
        item for item in paper_context
        if item['paper_id'] == request.paper_id or item['content_type'] == 'qa'
    ]
    
    # Get paper metadata
    paper_info = None
    if database.is_connected:
        paper_info = await database.get_paper_info(request.paper_id)
    
    # Build context
    context_parts = []
    
    if paper_info:
        context_parts.append(f"## Paper: {paper_info.get('title', 'Unknown')}")
        context_parts.append(f"Authors: {', '.join(paper_info.get('authors', []))}")
        context_parts.append(f"Abstract: {paper_info.get('abstract', '')}")
    
    if paper_chunks:
        chunks_text = "\n".join([
            f"[{chunk['content_type'].upper()} - Chunk {chunk['chunk_index']}]: {chunk['content'][:500]}"
            for chunk in paper_chunks
        ])
        context_parts.append(f"## Paper Content\n{chunks_text}")
    
    context = "\n\n".join(context_parts) if context_parts else "No paper context found."
    
    system_instruction = """You are an AI research assistant helping researchers understand academic papers.
Answer questions based on the provided paper content. Cite specific sections when possible.
If information is not available in the context, clearly state that."""

    prompt = f"""Paper Context:
{context}

---

Question: {request.question}

Provide a detailed answer based on the paper content."""

    try:
        answer, latency_ms = await groq_client.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.3,
            max_tokens=1024,
        )
        
        # Store artifact
        artifact_id = await store_ai_artifact(
            group_id=request.group_id,
            artifact_type="qa",
            content=answer,
            prompt=request.question,
            paper_id=request.paper_id,
            session_id=request.session_id,
            user_id=request.user_id,
            metadata={"vector_ids_used": vector_ids}
        )
        
        total_latency = int((time.time() - start_time) * 1000)
        
        return PaperAnswerResponse(
            id=artifact_id or str(uuid.uuid4()),
            answer=answer,
            paper_id=request.paper_id,
            sources=[
                {"id": item['id'], "type": item['content_type'], "chunk": item['chunk_index']}
                for item in paper_chunks[:5]
            ],
            metadata={
                "model": groq_client.model_name,
                "paper_title": paper_info.get('title') if paper_info else None,
            },
            latency_ms=total_latency
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )


# ============ Paper Summarization ============

@app.post(
    "/papers/summarize",
    response_model=PaperSummaryResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Papers"],
    summary="Generate paper summary",
)
async def paper_summarize(request: PaperSummarizeRequest):
    """
    Generate a summary for a paper.
    
    CRITICAL: Requires @ai trigger. Summary is stored in group namespace.
    """
    validate_uuid(request.group_id, "group_id")
    validate_ai_trigger(request.trigger, "trigger")
    
    if not groq_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured.",
        )
    
    start_time = time.time()
    
    # Get paper content from group's vectors
    paper_context, vector_ids = await get_group_context(
        group_id=request.group_id,
        query="full paper content summary abstract",
        limit=20,
        content_types=["paper"]
    )
    
    paper_chunks = [item for item in paper_context if item['paper_id'] == request.paper_id]
    
    # Get paper metadata
    paper_info = None
    if database.is_connected:
        paper_info = await database.get_paper_info(request.paper_id)
    
    if not paper_info and not paper_chunks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found in group context.",
        )
    
    # Build context
    context_parts = []
    
    if paper_info:
        context_parts.append(f"Title: {paper_info.get('title', 'Unknown')}")
        context_parts.append(f"Authors: {', '.join(paper_info.get('authors', []))}")
        context_parts.append(f"Abstract: {paper_info.get('abstract', '')}")
    
    if paper_chunks:
        chunks_text = "\n\n".join([chunk['content'] for chunk in paper_chunks])
        context_parts.append(f"Paper Content:\n{chunks_text}")
    
    context = "\n\n".join(context_parts)
    
    system_instruction = """You are an AI research assistant that creates concise summaries of academic papers.
Provide a structured summary with:
1. Main contribution (1-2 sentences)
2. Key findings (3-5 bullet points)
3. Methodology overview (1 paragraph)
4. Implications (1-2 sentences)"""

    prompt = f"""{context}

---

Generate a comprehensive summary of this paper."""

    try:
        summary_text, latency_ms = await groq_client.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.3,
            max_tokens=1500,
        )
        
        # Extract key points
        key_points = []
        for line in summary_text.split('\n'):
            if line.strip().startswith(('-', '•', '*')):
                key_points.append(line.strip().lstrip('-•* '))
        
        # Store artifact
        artifact_id = await store_ai_artifact(
            group_id=request.group_id,
            artifact_type="summary",
            content=summary_text,
            paper_id=request.paper_id,
            session_id=request.session_id,
            user_id=request.user_id,
            metadata={
                "paper_title": paper_info.get('title') if paper_info else None,
                "key_points_count": len(key_points)
            }
        )
        
        total_latency = int((time.time() - start_time) * 1000)
        
        return PaperSummaryResponse(
            id=artifact_id or str(uuid.uuid4()),
            summary=summary_text,
            key_points=key_points[:5],
            paper_id=request.paper_id,
            metadata={
                "model": groq_client.model_name,
                "paper_title": paper_info.get('title') if paper_info else None,
            },
            latency_ms=total_latency
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )


# ============ Add Paper to Group ============

@app.post(
    "/groups/{group_id}/papers",
    response_model=AddPaperResponse,
    tags=["Papers"],
    summary="Add paper to group and embed",
)
async def add_paper_to_group(group_id: str, request: AddPaperToGroupRequest):
    """
    Add a paper to a group's context and generate embeddings.
    
    This enables RAG retrieval for this paper within the group namespace.
    """
    validate_uuid(group_id, "group_id")
    if request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
    if not vector_store.is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vector store not connected.",
        )
    
    try:
        # Insert paper chunks with embeddings
        vector_ids = await vector_store.insert_paper_chunks(
            group_id=group_id,
            paper_id=request.paper_id,
            title=request.title,
            abstract=request.abstract,
            full_text=request.full_text,
            metadata={
                "added_by": request.user_id,
                **(request.metadata or {})
            }
        )
        
        return AddPaperResponse(
            success=True,
            paper_id=request.paper_id,
            group_id=group_id,
            vectors_created=len(vector_ids),
            message=f"Paper added to group with {len(vector_ids)} vector embeddings."
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add paper: {str(e)}",
        )


# ============ Vector Search ============

@app.post(
    "/vectors/search",
    response_model=VectorSearchResponse,
    tags=["Vectors"],
    summary="Search group vectors",
)
async def search_vectors(request: VectorSearchRequest):
    """
    Search vectors within a group's isolated namespace.
    
    CRITICAL: Always filters by groupId to prevent cross-group retrieval.
    """
    validate_uuid(request.group_id, "group_id")
    if not vector_store.is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vector store not connected.",
        )
    
    start_time = time.time()
    
    try:
        results = await vector_store.search_group_vectors(
            group_id=request.group_id,
            query=request.query,
            limit=request.limit,
            content_types=request.content_types,
            paper_id=request.paper_id
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        return VectorSearchResponse(
            results=results,
            total=len(results),
            group_id=request.group_id,
            latency_ms=latency_ms
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


# ============ Report Generation ============

@app.post(
    "/reports/group/{group_id}/generate",
    response_model=ReportResponse,
    tags=["Reports"],
    summary="Generate group report",
)
async def generate_report(group_id: str, request: GenerateReportRequest):
    """
    Generate a PDF report for a group.
    
    Report includes only group-linked content.
    """
    validate_uuid(group_id, "group_id")
    validate_uuid(request.group_id, "group_id")
    if request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
    if request.prompt:
        validate_ai_trigger(request.prompt)
    
    if not database.is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not connected.",
        )
    
    try:
        # Fetch group data
        group_info = await database.get_group_info(group_id)
        if not group_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found.",
            )
        
        # Fetch group content
        sessions = []
        if request.include_sessions:
            sessions = await database.get_group_sessions_with_messages(group_id)
        
        papers = []
        if request.include_papers:
            papers = await database.get_group_papers(group_id)
        
        summaries = []
        qa_artifacts = []
        if request.include_summaries:
            artifacts = await database.get_group_artifacts(group_id)
            summaries = [a for a in artifacts if a['artifact_type'] in ('summary', 'session_summary')]
            qa_artifacts = [a for a in artifacts if a['artifact_type'] == 'qa']
        
        memory_notes = await database.get_group_memory_notes(group_id)
        
        # Get user info
        user_info = await database.get_user_info(request.user_id) if request.user_id else None
        generated_by = user_info.get('name', 'Unknown') if user_info else 'System'
        
        # Generate PDF
        filepath, filename, file_size = report_generator.generate_group_report(
            group_id=group_id,
            group_name=group_info.get('name', 'Unknown Group'),
            group_description=group_info.get('description', ''),
            sessions=sessions,
            papers=papers,
            summaries=summaries,
            qa_artifacts=qa_artifacts,
            memory_notes=memory_notes,
            generated_by=generated_by,
            include_sessions=request.include_sessions,
            include_papers=request.include_papers,
            include_summaries=request.include_summaries,
            custom_prompt=request.prompt
        )
        
        # Store report metadata
        report_id = await database.store_report_metadata(
            group_id=group_id,
            generated_by=request.user_id,
            title=f"Group Report - {group_info.get('name', 'Unknown')}",
            file_path=filepath,
            file_size=file_size,
            include_sessions=request.include_sessions,
            include_papers=request.include_papers,
            include_summaries=request.include_summaries
        )
        
        return ReportResponse(
            id=report_id or str(uuid.uuid4()),
            url=f"/reports/{filename}",
            filename=filename,
            file_size=file_size,
            group_id=group_id,
            created_at=datetime.now(timezone.utc)
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Report generation failed: {str(e)}",
        )


@app.get(
    "/reports/{filename}",
    tags=["Reports"],
    summary="Download report",
)
async def download_report(filename: str):
    """Download a generated report PDF."""
    filepath = f"./reports/{filename}"
    
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )
    
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/pdf"
    )


