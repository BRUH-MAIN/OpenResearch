"""Raw vector search over a group's namespace."""

import logging
import time

from fastapi import APIRouter, HTTPException, status

from ..deps import require_vector_store, validate_uuid
from ..models import VectorSearchRequest, VectorSearchResponse
from ..vector_store import vector_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Vectors"])


@router.post("/vectors/search", response_model=VectorSearchResponse, summary="Search group vectors")
async def search_vectors(request: VectorSearchRequest) -> VectorSearchResponse:
    """Semantic search inside one group. Always filtered by group_id — this is
    the isolation boundary that keeps one team's papers out of another's answers."""
    validate_uuid(request.group_id, "group_id")
    require_vector_store()

    start_time = time.time()

    try:
        results = await vector_store.search_group_vectors(
            group_id=request.group_id,
            query=request.query,
            limit=request.limit,
            content_types=request.content_types,
            paper_id=request.paper_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Vector search failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed.",
        )

    return VectorSearchResponse(
        results=results,
        total=len(results),
        group_id=request.group_id,
        latency_ms=int((time.time() - start_time) * 1000),
    )
