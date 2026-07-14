"""OpenResearch AI Service.

FastAPI service providing group-isolated RAG chat, paper Q&A, summarization,
and PDF reports. The Node server is the only client; the browser never talks
to this service directly.

AI only ever responds when a message contains an explicit @ai trigger.
"""

import logging
import os
import time
import traceback
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import database
from .embeddings import embedding_service
from .llm_client import llm_client
from .routers import chat, health, papers, reports, vectors
from .vector_store import vector_store

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

CORRELATION_HEADER = "X-Correlation-Id"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start dependencies up front so /health reports the truth immediately."""
    settings = get_settings()

    steps = [
        ("LLM client (DeepSeek → Groq fallback)", llm_client.initialize()),
        ("Embedding service (Gemini)", embedding_service.initialize()),
        ("Database", await database.connect()),
        ("Vector store", await vector_store.connect()),
    ]

    Path(settings.reports_dir).mkdir(parents=True, exist_ok=True)

    ready = sum(1 for _, ok in steps if ok)
    for name, ok in steps:
        logger.info("%s %s", "✅" if ok else "⚠️ ", name)
    logger.info("%d/%d dependencies ready", ready, len(steps))

    yield

    await database.disconnect()
    await vector_store.disconnect()
    logger.info("AI service shutdown complete")


app = FastAPI(
    title="OpenResearch AI Service",
    description=(
        "AI-powered features for the OpenResearch collaboration platform. "
        "AI only responds when triggered by @ai."
    ),
    version="3.0.0",
    lifespan=lifespan,
)

_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Carry the Node server's correlation ID through this service's logs and
    back out in the response, so one request can be traced across all three tiers."""
    correlation_id = request.headers.get(CORRELATION_HEADER) or str(uuid.uuid4())
    request.state.correlation_id = correlation_id

    start = time.time()
    response = await call_next(request)
    response.headers[CORRELATION_HEADER] = correlation_id

    logger.info(
        "%s %s -> %d (%dms) [correlation_id=%s]",
        request.method,
        request.url.path,
        response.status_code,
        int((time.time() - start) * 1000),
        correlation_id,
    )
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log the traceback server-side; never leak internals to the caller."""
    correlation_id = getattr(request.state, "correlation_id", None)
    logger.error(
        "Unhandled exception [correlation_id=%s]: %s\n%s",
        correlation_id,
        exc,
        traceback.format_exc(),
    )

    detail = str(exc) if get_settings().debug else "Internal server error"
    return JSONResponse(
        status_code=500,
        content={"detail": detail, "correlation_id": correlation_id},
    )


app.include_router(health.router)
app.include_router(chat.router)
app.include_router(papers.router)
app.include_router(vectors.router)
app.include_router(reports.router)
