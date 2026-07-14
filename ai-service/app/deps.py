"""Shared helpers for the API routers: validation, RAG retrieval, prompts, artifacts."""

import logging
import uuid
from typing import Optional

from fastapi import HTTPException, status

from .database import database
from .llm_client import llm_client
from .vector_store import vector_store

logger = logging.getLogger(__name__)

# Content types worth pulling into a chat answer's context window.
CHAT_CONTENT_TYPES = ["paper", "qa", "summary"]

CHAT_SYSTEM_INSTRUCTION = """You are an AI research assistant for OpenResearch, a collaboration platform for research teams.
You help researchers by answering questions using the group's papers and discussion context.
Always cite sources when possible using [SOURCE_TYPE] references.
Be concise, accurate, and helpful. Use academic language appropriate for researchers."""


def validate_ai_trigger(text: str, field_name: str = "prompt") -> str:
    """AI only ever responds to an explicit @ai mention — never ambient chatter."""
    if not text or "@ai" not in text.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must contain @ai trigger. AI only responds when triggered by @ai.",
        )
    return text


def validate_uuid(value: str, field_name: str = "id") -> str:
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a valid UUID.",
        )
    return value


def require_llm() -> None:
    if not llm_client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured. Set DEEPSEEK_API_KEY or GROQ_API_KEY.",
        )


def require_vector_store() -> None:
    if not vector_store.is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vector store not connected.",
        )


def strip_trigger(prompt: str) -> str:
    """Remove the @ai mention to get the actual query. Case is preserved — it
    carries meaning for the embedding model (acronyms, proper nouns)."""
    import re

    return re.sub(r"@ai", "", prompt, flags=re.IGNORECASE).strip()


async def get_group_context(
    group_id: str,
    query: str,
    limit: int = 10,
    content_types: Optional[list[str]] = None,
) -> tuple[list[dict], list[str]]:
    """Retrieve group-isolated RAG context.

    Hybrid retrieval: pgvector cosine similarity + Postgres full-text BM25,
    fused with Reciprocal Rank Fusion. hybrid_search_group_vectors already
    falls back to vector-only internally if full-text search fails.

    Returns (context_items, vector_ids_used).
    """
    validate_uuid(group_id, "group_id")
    if not vector_store.is_connected:
        return [], []

    results = await vector_store.hybrid_search_group_vectors(
        group_id=group_id,
        query=query,
        limit=limit,
        content_types=content_types,
    )

    return results, [item["id"] for item in results]


def build_chat_prompt(context_items: list[dict], session_messages: list[dict], prompt: str) -> str:
    """Assemble the RAG prompt. Shared by the streaming and non-streaming chat
    endpoints so their behaviour cannot drift apart."""
    context_parts = []

    if context_items:
        rag_context = "\n".join(
            f"[{item['content_type'].upper()}] {item['content'][:500]}"
            for item in context_items
        )
        context_parts.append(f"## Retrieved Context\n{rag_context}")

    if session_messages:
        messages_text = "\n".join(
            f"[{msg.get('user_name', 'Unknown')}]: {msg.get('content', '')}"
            for msg in session_messages[-10:]
        )
        context_parts.append(f"## Recent Messages\n{messages_text}")

    context = "\n\n".join(context_parts) if context_parts else "No context available."

    return f"""Group Context:
{context}

---

User Request: {prompt}

Provide a helpful response based on the group's context."""


def build_sources(context_items: list[dict], limit: int = 5) -> list[dict]:
    """Citation chips for the client: what the answer was grounded in."""
    return [
        {
            "id": item["id"],
            "type": item["content_type"],
            "title": item.get("title") or "",
            "url": item.get("url") or "",
            "similarity": round(item.get("similarity", 0), 3),
        }
        for item in context_items[:limit]
    ]


async def store_ai_artifact(
    group_id: str,
    artifact_type: str,
    content: str,
    prompt: Optional[str] = None,
    session_id: Optional[str] = None,
    paper_id: Optional[str] = None,
    user_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Optional[str]:
    """Persist an AI output and embed it back into the group's namespace, so
    past answers become retrievable context for future ones."""
    if not database.is_connected:
        return None

    artifact_id = await database.store_ai_artifact(
        group_id=group_id,
        artifact_type=artifact_type,
        content=content,
        prompt=prompt,
        session_id=session_id,
        paper_id=paper_id,
        user_id=user_id,
        metadata=metadata,
    )

    if artifact_id and vector_store.is_connected:
        await vector_store.insert_vector(
            group_id=group_id,
            paper_id=paper_id or "system",
            content=content,
            content_type=artifact_type,
            content_id=artifact_id,
            metadata={"artifact_type": artifact_type, **(metadata or {})},
        )

    return artifact_id
