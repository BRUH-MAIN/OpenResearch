"""The research agent endpoint.

Streams the agent's reasoning as it happens — each tool call and each
observation — rather than making the user stare at a spinner for a minute. The
visible trace is also what makes an agent's answer trustworthy: you can see what
it looked at.
"""

import json
import logging
import time

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from ..agent import ResearchAgent
from ..deps import (
    require_llm,
    store_ai_artifact,
    strip_trigger,
    validate_uuid,
)
from ..llm_client import llm_client
from ..models import ErrorResponse, GroupAIChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["Agent"])


@router.post(
    "/{group_id}/agent/stream",
    responses={
        400: {"model": ErrorResponse, "description": "Missing @ai trigger or bad group"},
        503: {"model": ErrorResponse, "description": "AI service not configured"},
    },
    summary="Run the research agent (streamed)",
)
async def run_research_agent(group_id: str, request: GroupAIChatRequest) -> StreamingResponse:
    """Investigate a question with tools, then answer with citations.

    Emits NDJSON:
      {"step": {...}}         a tool is about to run
      {"observation": {...}}  it came back
      {"token": "..."}        a token of the final answer
      {"done": true, "sources": [...], "iterations": N}
    """
    validate_uuid(group_id, "group_id")
    if request.group_id and request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
    require_llm()

    question = strip_trigger(request.prompt)

    async def event_stream():
        start = time.time()
        agent = ResearchAgent(group_id)
        chunks: list[str] = []
        sources: list[dict] = []
        iterations = 0

        try:
            async for event in agent.run(question):
                if "token" in event:
                    chunks.append(event["token"])
                elif event.get("done"):
                    sources = event.get("sources", [])
                    iterations = event.get("iterations", 0)
                    continue  # re-emitted below, with the latency attached
                yield json.dumps(event) + "\n"
        except Exception as exc:
            logger.error("Research agent failed: %s", exc, exc_info=True)
            yield json.dumps({"error": "The research agent failed."}) + "\n"
            return

        answer = "".join(chunks)
        latency_ms = int((time.time() - start) * 1000)

        try:
            await store_ai_artifact(
                group_id=group_id,
                artifact_type="chat_response",
                content=answer,
                prompt=request.prompt,
                session_id=request.session_id,
                user_id=request.user_id,
                metadata={
                    "agent": True,
                    "iterations": iterations,
                    "source_count": len(sources),
                    "latency_ms": latency_ms,
                },
            )
        except Exception as exc:
            # The answer already reached the user; persisting it is best-effort.
            logger.warning("Failed to persist agent artifact: %s", exc)

        yield json.dumps({
            "done": True,
            "latency_ms": latency_ms,
            "iterations": iterations,
            "sources": sources,
            "model": llm_client.model_name,
        }) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
