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
import logging
import time
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

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
    IntentClassifyDetailedResponse,
)
from .groq_client import groq_client
from .intent_classifier import classify_intent, classify_intent_detailed, INTENT_THRESHOLD
from .database import database
from .embeddings import embedding_service
from .vector_store import vector_store
from .report_generator import report_generator
from .agentic import agentic_service
from .reranker import reranker


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    import time as _time
    settings = get_settings()
    total_steps = 5
    results = []

    print()
    print("=" * 60)
    print(f"  🚀  {settings.app_name} — Starting up")
    print("=" * 60)
    print()

    # ── Step 1: LLM (DeepSeek primary, Groq fallback) ─────
    print(f"[1/{total_steps}]  Initializing LLM client (DeepSeek → Groq fallback) …")
    t0 = _time.time()
    if groq_client.initialize():
        results.append(("LLM client", True, _time.time() - t0))
        print(f"  ✅  LLM ready — provider: {groq_client._provider} / {groq_client.model_name} ({_time.time() - t0:.1f}s)")
    else:
        results.append(("LLM client", False, _time.time() - t0))
        print(f"  ⚠️   No LLM API key configured (set DEEPSEEK_API_KEY or GROQ_API_KEY)")
    print()

    # ── Step 2: Embedding model ────────────────────────────
    print(f"[2/{total_steps}]  Loading embedding model …")
    t0 = _time.time()
    if embedding_service.initialize():
        results.append(("Embedding model", True, _time.time() - t0))
        print(f"  ✅  Embedding model loaded ({_time.time() - t0:.1f}s)")
    else:
        results.append(("Embedding model", False, _time.time() - t0))
        print(f"  ⚠️   Embedding model failed to load ({_time.time() - t0:.1f}s)")
    print()

    # ── Step 3: Database ───────────────────────────────────
    print(f"[3/{total_steps}]  Connecting to database …")
    t0 = _time.time()
    if await database.connect():
        results.append(("Database", True, _time.time() - t0))
        print(f"  ✅  Database connected ({_time.time() - t0:.1f}s)")
    else:
        results.append(("Database", False, _time.time() - t0))
        print(f"  ⚠️   Database not connected")
    print()

    # ── Step 4: Vector store ───────────────────────────────
    print(f"[4/{total_steps}]  Connecting to vector store …")
    t0 = _time.time()
    if await vector_store.connect():
        results.append(("Vector store", True, _time.time() - t0))
        print(f"  ✅  Vector store connected ({_time.time() - t0:.1f}s)")
    else:
        results.append(("Vector store", False, _time.time() - t0))
        print(f"  ⚠️   Vector store not connected")
    print()

    # ── Step 5: Agentic orchestration ─────────────────────
    print(f"[5/{total_steps}]  Initializing agentic orchestration …")
    t0 = _time.time()
    if agentic_service.initialize():
        results.append(("Agentic orchestration", True, _time.time() - t0))
        print(f"  ✅  Agentic orchestration ready ({_time.time() - t0:.1f}s)")
    else:
        results.append(("Agentic orchestration", False, _time.time() - t0))
        print(f"  ⚠️   Agentic orchestration not configured")
    print()

    # Create reports directory
    os.makedirs("./reports", exist_ok=True)

    # Ensure workflow tables exist
    try:
        await database.ensure_workflow_tables()
        print("  ✅  Workflow tables verified")
    except Exception as e:
        print(f"  ⚠️   Workflow tables check failed: {e}")
    print()

    # ── Summary ────────────────────────────────────────────
    ok = sum(1 for _, s, _ in results if s)
    print("=" * 60)
    print(f"  {'✅' if ok == total_steps else '⚠️ '}  {ok}/{total_steps} services initialized")
    for name, success, elapsed in results:
        icon = "✅" if success else "❌"
        print(f"      {icon}  {name} ({elapsed:.1f}s)")
    print("=" * 60)
    print()
    
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
_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
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
    content_types: Optional[list[str]] = None,
    use_hybrid: bool = True,
    use_reranker: bool = True,
) -> tuple[list[dict], list[str]]:
    """
    Retrieve group-isolated context for RAG.
    Uses hybrid search (vector + BM25) with cross-encoder reranking by default.
    
    Returns:
        Tuple of (context_items, vector_ids_used)
    """
    validate_uuid(group_id, "group_id")
    if not vector_store.is_connected:
        return [], []

    # Phase 1: Retrieve candidates via hybrid or vector-only search
    fetch_limit = limit * 3 if use_reranker else limit
    if use_hybrid:
        try:
            results = await vector_store.hybrid_search_group_vectors(
                group_id=group_id,
                query=query,
                limit=fetch_limit,
                content_types=content_types,
            )
        except Exception:
            results = await vector_store.search_group_vectors(
                group_id=group_id,
                query=query,
                limit=fetch_limit,
                content_types=content_types,
            )
    else:
        results = await vector_store.search_group_vectors(
            group_id=group_id,
            query=query,
            limit=fetch_limit,
            content_types=content_types,
        )

    # Phase 2: Rerank with cross-encoder for higher precision
    if use_reranker and len(results) > 1:
        results = await reranker.rerank(
            query=query,
            results=results,
            top_k=limit,
            content_key="content",
        )
    else:
        results = results[:limit]

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

    task_type, similarity, matched_phrase = classify_intent(request.prompt)
    return IntentClassifyResponse(
        task_type=task_type,
        similarity=similarity,
        threshold=INTENT_THRESHOLD,
        matched_phrase=matched_phrase,
    )


@app.post(
    "/agentic/classify-intent-detailed",
    response_model=IntentClassifyDetailedResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Agentic"],
    summary="Classify agentic intent with ambiguity detection",
)
async def classify_agentic_intent_detailed(request: IntentClassifyRequest):
    """Classify a prompt into an agentic task with ambiguity detection and alternatives."""
    validate_ai_trigger(request.prompt, "prompt")

    if not embedding_service.is_configured:
        embedding_service.initialize()

    detailed = classify_intent_detailed(request.prompt)
    return IntentClassifyDetailedResponse(
        task_type=detailed.get("intent"),
        similarity=detailed.get("confidence", 0.0),
        threshold=INTENT_THRESHOLD,
        matched_phrase=detailed.get("matched_phrase"),
        ambiguous=detailed.get("ambiguous", False),
        fallback=detailed.get("fallback", False),
        alternatives=[
            {"intent": alt.get("intent"), "score": alt.get("confidence", 0.0)}
            for alt in detailed.get("alternatives", [])
        ],
    )


# ============ Citation Graph ============

from app.tools.citation_graph import build_citation_graph as _build_graph

class CitationGraphRequest(BaseModel):
    group_id: Optional[str] = None
    query: str = Field(..., min_length=1, max_length=4000, description="Research topic to build citation graph for")
    session_id: Optional[str] = None

@app.post(
    "/citation-graph/build",
    tags=["Citation Graph"],
    summary="Build a citation graph from gathered sources",
)
async def build_citation_graph_endpoint(request: CitationGraphRequest):
    """Gather sources for the query and build a citation relationship graph.

    Enhanced with claim extraction, verification, and semantic similarity."""
    try:
        # Generate sub-queries
        sub_queries = await agentic_service._call_llm_json(
            system_prompt=(
                "Generate 3-5 focused search queries to find papers related "
                "to this research topic. Return a JSON array of strings."
            ),
            user_prompt=request.query,
            temperature=0.2,
        )
        if not isinstance(sub_queries, list):
            sub_queries = [request.query]

        # Gather context (vector store + web + arXiv)
        context_text, sources = await agentic_service._gather_context(
            query=request.query,
            sub_queries=sub_queries,
            group_id=request.group_id,
        )

        # Extract claims from the query/context via LLM
        claims = []
        try:
            claims_raw = await agentic_service._call_llm_json(
                system_prompt=(
                    "You are an academic fact-checker. Given research context, extract "
                    "3-8 key factual claims. For each claim, identify which source(s) "
                    'support or contradict it. Return JSON: [{"text": "claim text", '
                    '"source_sids": ["s0", "s1"], "verdict": "supports|contradicts|neutral", '
                    '"excerpt": "brief evidence excerpt from the source"}]'
                ),
                user_prompt=(
                    f"Research topic: {request.query}\n\n"
                    f"Sources and context:\n{context_text[:6000]}"
                ),
                temperature=0.2,
            )
            if isinstance(claims_raw, list):
                for i, c in enumerate(claims_raw):
                    if isinstance(c, dict) and c.get("text"):
                        c["id"] = f"claim_{i}"
                        claims.append(c)
        except Exception as exc:
            logger.warning("Claim extraction failed: %s", exc)

        # Compute source embeddings for semantic similarity
        embeddings = {}
        try:
            from app.embeddings import embedding_service
            if embedding_service.is_configured:
                for src in sources[:15]:  # Limit to avoid excessive embedding calls
                    sid = src.get("sid", "")
                    embed_text = f"{src.get('title', '')} {src.get('content', '')[:500]}"
                    if embed_text.strip():
                        emb, _ = await embedding_service.generate_embedding(embed_text)
                        if emb:
                            embeddings[sid] = emb
        except Exception as exc:
            logger.warning("Embedding computation for similarity failed: %s", exc)

        # Build graph with enhanced features
        graph = _build_graph(sources, context_text, claims=claims, embeddings=embeddings)
        return {"graph": graph, "source_count": len(sources), "claims": claims}

    except Exception as e:
        logger.exception("Citation graph build failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Citation graph build failed: {str(e)}",
        )


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
    # Use path param as canonical group_id; validate body matches if provided
    if request.group_id and request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
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


@app.post(
    "/groups/{group_id}/ai-chat/stream",
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Group AI"],
    summary="Stream group AI chat tokens",
)
async def group_ai_chat_stream(group_id: str, request: GroupAIChatRequest):
    """
    Stream AI chat response token-by-token for a group.

    Returns NDJSON: each line is {"token":"..."} or {"done":true,"latency_ms":N,"sources":[...]}.
    """
    import json as _json

    validate_uuid(group_id, "group_id")
    validate_uuid(request.group_id, "group_id")
    if request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
    if not groq_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Please set GROQ_API_KEY.",
        )

    # --- RAG context retrieval (same as non-streaming) ---
    query = request.prompt.lower().replace('@ai', '').strip()

    try:
        context_items, vector_ids = await get_group_context(
            group_id=group_id, query=query, limit=10,
            content_types=["paper", "qa", "summary", "memory"],
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    session_messages = []
    if request.session_id and database.is_connected:
        session_messages = await database.get_session_messages(request.session_id, limit=30)

    memory_notes = []
    if database.is_connected:
        memory_notes = await database.get_group_memory_notes(group_id, limit=10)

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

    system_instruction = """You are an AI research assistant for OpenResearch, a collaboration platform for research teams.
You help researchers by answering questions using the group's papers, discussion context, and memory notes.
Always cite sources when possible using [SOURCE_TYPE] references.
Be concise, accurate, and helpful. Use academic language appropriate for researchers."""

    prompt = f"""Group Context:
{context}

---

User Request: {request.prompt}

Provide a helpful response based on the group's context."""

    sources = [
        {"id": item['id'], "type": item['content_type'], "similarity": item['similarity']}
        for item in context_items[:5]
    ]

    async def _stream():
        start = time.time()
        full_text = []
        try:
            async for token in groq_client.generate_stream(
                prompt=prompt,
                system_instruction=system_instruction,
                temperature=0.5,
                max_tokens=2048,
            ):
                full_text.append(token)
                yield _json.dumps({"token": token}) + "\n"
        except Exception as exc:
            yield _json.dumps({"error": str(exc)}) + "\n"
            return

        latency_ms = int((time.time() - start) * 1000)

        # Store artifact in background
        full_answer = "".join(full_text)
        try:
            await store_ai_artifact(
                group_id=group_id,
                artifact_type="chat_response",
                content=full_answer,
                prompt=request.prompt,
                session_id=request.session_id,
                user_id=request.user_id,
                metadata={
                    "vector_ids_used": vector_ids,
                    "context_items_count": len(context_items),
                    "latency_ms": latency_ms,
                    "streamed": True,
                },
            )
        except Exception:
            pass  # non-critical

        yield _json.dumps({
            "done": True,
            "latency_ms": latency_ms,
            "sources": sources,
            "model": groq_client.model_name,
            "context_items_used": len(context_items),
            "vector_ids_used": vector_ids,
        }) + "\n"

    return StreamingResponse(_stream(), media_type="application/x-ndjson")


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
    
    Enhanced pipeline: query expansion → hybrid retrieval → cross-encoder
    reranking → chain-of-thought answer generation.
    
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

    # ─── Phase 0: Query expansion ───────────────────────────────────
    # Generate 2 alternative phrasings via LLM to improve recall
    expanded_queries = [query]
    try:
        expansion_prompt = (
            f"Given this academic research question, generate 2 alternative phrasings "
            f"that would help find relevant paper passages. Return ONLY a JSON array of strings.\n\n"
            f"Question: {query}"
        )
        expansion_raw, _ = await groq_client.generate(
            prompt=expansion_prompt,
            system_instruction="You are a search query expansion engine. Return only a JSON array of 2 strings.",
            temperature=0.4,
            max_tokens=200,
        )
        import json as _json
        alt_queries = _json.loads(expansion_raw.strip().strip("`").strip())
        if isinstance(alt_queries, list):
            expanded_queries.extend([q.strip() for q in alt_queries[:2] if isinstance(q, str)])
    except Exception:
        pass  # Graceful fallback to original query only

    # ─── Phase 1: Multi-query hybrid retrieval + reranking ──────────
    all_chunks_map: dict[str, dict] = {}  # dedup by id
    all_vector_ids: list[str] = []

    for eq in expanded_queries:
        paper_context, vids = await get_group_context(
            group_id=request.group_id,
            query=eq,
            limit=8,
            content_types=["paper", "qa"],
            use_hybrid=True,
            use_reranker=True,
        )
        for item in paper_context:
            all_chunks_map[item['id']] = item
        all_vector_ids.extend(vids)

    all_chunks = list(all_chunks_map.values())
    vector_ids = list(dict.fromkeys(all_vector_ids))  # dedup, preserve order

    # Filter to specific paper if specified
    paper_chunks = [
        item for item in all_chunks
        if item['paper_id'] == request.paper_id or item['content_type'] == 'qa'
    ]
    
    # Get paper metadata
    paper_info = None
    if database.is_connected:
        paper_info = await database.get_paper_info(request.paper_id)
    
    # ─── Phase 2: Build enriched context ────────────────────────────
    context_parts = []
    
    if paper_info:
        context_parts.append(f"## Paper: {paper_info.get('title', 'Unknown')}")
        context_parts.append(f"Authors: {', '.join(paper_info.get('authors', []))}")
        context_parts.append(f"Abstract: {paper_info.get('abstract', '')}")
    
    if paper_chunks:
        chunks_text = "\n".join([
            f"[Source {i+1} | {chunk['content_type'].upper()} | Chunk {chunk['chunk_index']} "
            f"| sim={chunk.get('similarity', 0):.3f}]: {chunk['content'][:600]}"
            for i, chunk in enumerate(paper_chunks[:10])
        ])
        context_parts.append(f"## Retrieved Passages\n{chunks_text}")
    
    context = "\n\n".join(context_parts) if context_parts else "No paper context found."

    # ─── Phase 3: Chain-of-thought answer generation ────────────────
    system_instruction = """You are an expert AI research assistant helping researchers understand academic papers.
Use a structured chain-of-thought approach:

1. **Identify**: Which retrieved passages are most relevant to the question?
2. **Analyze**: What do those passages say? Quote or paraphrase key phrases.
3. **Synthesize**: Combine evidence into a coherent answer.
4. **Cite**: Reference source numbers (e.g., [Source 1]) so the user can verify.
5. **Gaps**: If information is incomplete, state what is missing.

Format your answer with clear sections. Be precise and cite sources."""

    prompt = f"""Paper Context:
{context}

---

Question: {request.question}

Think step-by-step using the retrieved passages, then provide a comprehensive answer."""

    try:
        answer, latency_ms = await groq_client.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.3,
            max_tokens=1536,
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
            metadata={
                "vector_ids_used": vector_ids,
                "expanded_queries": expanded_queries,
                "num_chunks_retrieved": len(all_chunks),
                "num_chunks_used": len(paper_chunks),
            }
        )
        
        total_latency = int((time.time() - start_time) * 1000)
        
        return PaperAnswerResponse(
            id=artifact_id or str(uuid.uuid4()),
            answer=answer,
            paper_id=request.paper_id,
            sources=[
                {
                    "id": item['id'],
                    "type": item['content_type'],
                    "chunk": item['chunk_index'],
                    "title": item.get('title', ''),
                    "url": item.get('url', ''),
                    "similarity": round(item.get('similarity', 0), 3),
                }
                for item in paper_chunks[:8]
            ],
            metadata={
                "model": groq_client.model_name,
                "paper_title": paper_info.get('title') if paper_info else None,
                "queries_used": expanded_queries,
                "retrieval_method": "hybrid+rerank",
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
        
        return ReportResponse(
            id=str(uuid.uuid4()),
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


# ============ Workflow Orchestration ============

from .models import (
    WorkflowPlanRequest, WorkflowPlanResponse,
    WorkflowStartRequest, WorkflowStepApprovalRequest,
    WorkflowCancelRequest, WorkflowStatusResponse,
    WorkflowTemplateInfo,
)
from .workflow_templates import list_templates as _list_templates, get_template as _get_template
from .planner_agent import plan_workflow as _plan_workflow
from .workflow_orchestrator import WorkflowOrchestrator
from .workflow_state import WorkflowPlan

_workflow_orchestrator = WorkflowOrchestrator(agentic_service)


@app.get(
    "/workflows/templates",
    response_model=list[WorkflowTemplateInfo],
    tags=["Workflows"],
    summary="List available workflow templates",
)
async def list_workflow_templates():
    """Return all predefined workflow templates."""
    templates = _list_templates()
    results = []
    for t in templates:
        results.append(WorkflowTemplateInfo(
            template_id=t["template_id"],
            title=t["title"],
            description=t["description"],
            research_type=t["research_type"],
            estimated_minutes=t["estimated_minutes"],
            step_count=t["step_count"],
            steps=t.get("steps_preview", t.get("steps", [])),
        ))
    return results


@app.post(
    "/workflows/plan",
    response_model=WorkflowPlanResponse,
    responses={
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    tags=["Workflows"],
    summary="Plan a research workflow from a goal",
)
async def plan_workflow_endpoint(request: WorkflowPlanRequest):
    """Analyze a research goal and produce a multi-step workflow plan.

    The workflow is created in *awaiting_approval* state so the user can
    review and approve before execution begins.
    """
    if not groq_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured.",
        )

    try:
        # Plan
        plan = await _plan_workflow(
            goal=request.goal,
            llm_call_fn=agentic_service._call_llm,
            preferred_template=request.preferred_template,
        )

        # Persist to DB
        workflow_id = str(uuid.uuid4())
        await database.create_workflow_run(
            workflow_id=workflow_id,
            user_id=request.user_id,
            goal=request.goal,
            plan=plan.to_dict(),
            group_id=request.group_id,
            session_id=request.session_id,
            template_id=plan.template_id,
            status="awaiting_approval",
        )

        # Create step rows
        for step in plan.steps:
            await database.create_workflow_step(
                workflow_run_id=workflow_id,
                step_index=step.step_index,
                agent_type=step.agent_type,
                name=step.name,
                description=step.description,
                is_checkpoint=step.is_checkpoint,
                input_data={"input_keys": step.input_keys, "agent_config": step.agent_config},
            )

        return WorkflowPlanResponse(
            workflow_id=workflow_id,
            template_id=plan.template_id,
            title=plan.title,
            description=plan.description,
            research_type=plan.research_type,
            estimated_minutes=plan.estimated_minutes,
            steps=[s.to_dict() for s in plan.steps],
            status="awaiting_approval",
        )
    except Exception as e:
        logger.exception("Workflow planning failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Workflow planning failed: {str(e)}",
        )


@app.post(
    "/workflows/start",
    tags=["Workflows"],
    summary="Start an approved workflow (streaming NDJSON)",
)
async def start_workflow_endpoint(request: WorkflowStartRequest):
    """Approve and begin executing a planned workflow.

    Returns a streaming NDJSON response with workflow events.
    """
    # Fetch the run
    run = await database.get_workflow_run(request.workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow not found.")

    if run["status"] not in ("awaiting_approval", "paused"):
        raise HTTPException(
            status_code=400,
            detail=f"Workflow cannot be started — current status: {run['status']}",
        )

    # Reconstruct the plan from the stored JSONB
    plan = WorkflowPlan.from_dict(run["plan"])

    return StreamingResponse(
        _workflow_orchestrator.execute_workflow(
            workflow_id=request.workflow_id,
            plan=plan,
            group_id=run["group_id"],
            user_id=run.get("user_id", "system"),
            session_id=run.get("session_id"),
            goal=run["goal"],
        ),
        media_type="application/x-ndjson",
    )


@app.post(
    "/workflows/approve-step",
    tags=["Workflows"],
    summary="Approve or reject a checkpoint step (streaming NDJSON)",
)
async def approve_workflow_step_endpoint(request: WorkflowStepApprovalRequest):
    """Handle checkpoint approval/rejection and resume the workflow.

    On approval the workflow continues from the next step.
    On rejection the step is marked rejected and the workflow pauses.
    """
    run = await database.get_workflow_run(request.workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow not found.")

    if run["status"] != "paused":
        raise HTTPException(
            status_code=400,
            detail=f"Workflow is not paused — current status: {run['status']}",
        )

    # Find the DB step ID from the run's step list
    target_step = next(
        (s for s in run.get("steps", []) if s["step_index"] == request.step_index), None
    )
    if not target_step:
        raise HTTPException(status_code=404, detail=f"Step {request.step_index} not found.")
    step_id = target_step["id"]

    if not request.approved:
        # Mark step as rejected, keep workflow paused
        await database.update_workflow_step_status(
            step_id,
            "rejected",
            user_feedback=request.feedback,
        )
        return {"status": "rejected", "message": "Step rejected. Workflow remains paused."}

    # Approved — update step and resume from next step
    await database.update_workflow_step_status(
        step_id,
        "approved",
        user_feedback=request.feedback,
    )

    # Collect intermediate results for completed steps
    existing_results = {}
    plan_for_keys = WorkflowPlan.from_dict(run["plan"])
    step_output_keys = {s.step_index: s.output_key for s in plan_for_keys.steps if s.output_key}

    for step in run.get("steps", []):
        # Checkpoint steps are stored as awaiting_approval until this endpoint runs.
        # Include them so downstream steps (e.g., latex_generator) can read outputs
        # from the just-approved checkpoint step.
        if step["status"] in ("completed", "approved", "awaiting_approval") and step.get("output"):
            output = step["output"]
            output_key = step_output_keys.get(step["step_index"], "")
            if output_key:
                # The orchestrator stores output as {"text": "...", ...}
                if isinstance(output, dict):
                    existing_results[output_key] = output.get("text", "")
                elif isinstance(output, str):
                    existing_results[output_key] = output

    resume_from = request.step_index + 1

    # Reuse the plan already reconstructed above
    plan = plan_for_keys

    return StreamingResponse(
        _workflow_orchestrator.execute_workflow(
            workflow_id=request.workflow_id,
            plan=plan,
            group_id=run["group_id"],
            user_id=run.get("user_id", "system"),
            session_id=run.get("session_id"),
            goal=run["goal"],
            start_from_step=resume_from,
            existing_results=existing_results,
        ),
        media_type="application/x-ndjson",
    )


@app.post(
    "/workflows/cancel",
    tags=["Workflows"],
    summary="Cancel a running or paused workflow",
)
async def cancel_workflow_endpoint(request: WorkflowCancelRequest):
    """Cancel a workflow. Running steps will not be interrupted mid-call."""
    run = await database.get_workflow_run(request.workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow not found.")

    if run["status"] in ("completed", "failed", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail=f"Workflow already in terminal state: {run['status']}",
        )

    await database.update_workflow_run_status(request.workflow_id, "cancelled")
    return {"status": "cancelled", "workflow_id": request.workflow_id}


@app.get(
    "/workflows/{workflow_id}/status",
    response_model=WorkflowStatusResponse,
    tags=["Workflows"],
    summary="Get workflow status and step details",
)
async def get_workflow_status(workflow_id: str):
    """Return the current status of a workflow including all step details."""
    validate_uuid(workflow_id, "workflow_id")
    run = await database.get_workflow_run(workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow not found.")

    steps = run.get("steps", [])
    return WorkflowStatusResponse(
        workflow_id=workflow_id,
        status=run["status"],
        current_step_index=run.get("current_step_index", 0),
        total_steps=len(steps),
        steps=steps,
        final_output=run.get("final_output"),
    )


@app.get(
    "/workflows/group/{group_id}",
    tags=["Workflows"],
    summary="List workflow runs for a group",
)
async def list_group_workflows(group_id: str, limit: int = Query(20, ge=1, le=100)):
    """Return all workflow runs for a group, most recent first."""
    validate_uuid(group_id, "group_id")
    runs = await database.get_workflow_runs_for_group(group_id, limit=limit)
    return {"workflows": runs, "total": len(runs)}
