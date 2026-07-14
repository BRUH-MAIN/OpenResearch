"""Group AI chat — the flagship RAG endpoint, streaming and non-streaming."""

import json
import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from ..database import database
from ..deps import (
    CHAT_CONTENT_TYPES,
    CHAT_SYSTEM_INSTRUCTION,
    build_chat_prompt,
    build_sources,
    get_group_context,
    require_llm,
    store_ai_artifact,
    strip_trigger,
    validate_uuid,
)
from ..llm_client import llm_client
from ..models import ErrorResponse, GroupAIChatRequest, GroupAIChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["Group AI"])

RESPONSES = {
    400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
    503: {"model": ErrorResponse, "description": "AI service not configured"},
}


async def _prepare(group_id: str, request: GroupAIChatRequest):
    """Shared setup: validate, retrieve context, build the prompt."""
    validate_uuid(group_id, "group_id")
    if request.group_id and request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
    require_llm()

    query = strip_trigger(request.prompt)

    try:
        context_items, vector_ids = await get_group_context(
            group_id=group_id,
            query=query,
            limit=10,
            content_types=CHAT_CONTENT_TYPES,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    session_messages = []
    if request.session_id and database.is_connected:
        session_messages = await database.get_session_messages(request.session_id, limit=30)

    prompt = build_chat_prompt(context_items, session_messages, request.prompt)
    return context_items, vector_ids, prompt


@router.post(
    "/{group_id}/ai-chat",
    response_model=GroupAIChatResponse,
    responses=RESPONSES,
    summary="Group AI chat with @ai trigger",
)
async def group_ai_chat(group_id: str, request: GroupAIChatRequest) -> GroupAIChatResponse:
    """Answer a question using the group's isolated RAG context."""
    start_time = time.time()
    context_items, vector_ids, prompt = await _prepare(group_id, request)

    try:
        answer, latency_ms = await llm_client.generate(
            prompt=prompt,
            system_instruction=CHAT_SYSTEM_INSTRUCTION,
            temperature=0.5,
            max_tokens=2048,
        )
    except Exception as exc:
        logger.error("Chat generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI generation failed.",
        )

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
            "latency_ms": latency_ms,
        },
    )

    return GroupAIChatResponse(
        id=artifact_id or str(uuid.uuid4()),
        text=answer,
        metadata={
            "model": llm_client.model_name,
            "context_items_used": len(context_items),
            "vector_ids_used": vector_ids,
        },
        sources=build_sources(context_items),
        latency_ms=int((time.time() - start_time) * 1000),
    )


@router.post(
    "/{group_id}/ai-chat/stream",
    responses=RESPONSES,
    summary="Stream group AI chat tokens",
)
async def group_ai_chat_stream(group_id: str, request: GroupAIChatRequest) -> StreamingResponse:
    """Same as /ai-chat, but streamed as NDJSON.

    Each line is {"token": "..."}; the final line is
    {"done": true, "latency_ms": N, "sources": [...]} — the server relays these
    to the browser over Socket.IO.
    """
    context_items, vector_ids, prompt = await _prepare(group_id, request)
    sources = build_sources(context_items)

    async def event_stream():
        start = time.time()
        chunks: list[str] = []

        try:
            async for token in llm_client.generate_stream(
                prompt=prompt,
                system_instruction=CHAT_SYSTEM_INSTRUCTION,
                temperature=0.5,
                max_tokens=2048,
            ):
                chunks.append(token)
                yield json.dumps({"token": token}) + "\n"
        except Exception as exc:
            logger.error("Chat stream failed: %s", exc, exc_info=True)
            yield json.dumps({"error": "AI generation failed."}) + "\n"
            return

        latency_ms = int((time.time() - start) * 1000)

        try:
            await store_ai_artifact(
                group_id=group_id,
                artifact_type="chat_response",
                content="".join(chunks),
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
        except Exception as exc:
            # The answer already reached the user; persisting it is best-effort.
            logger.warning("Failed to persist streamed chat artifact: %s", exc)

        yield json.dumps({
            "done": True,
            "latency_ms": latency_ms,
            "sources": sources,
            "model": llm_client.model_name,
            "context_items_used": len(context_items),
            "vector_ids_used": vector_ids,
        }) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
