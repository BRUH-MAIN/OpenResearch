from datetime import datetime, timezone

from fastapi import APIRouter

from ..database import database
from ..llm_client import llm_client
from ..models import HealthResponse
from ..vector_store import vector_store

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Check service health")
async def health_check() -> HealthResponse:
    """Dependency status. The Node server gates every AI call on this."""
    return HealthResponse(
        status="healthy",
        llm_configured=llm_client.is_configured,
        database_connected=database.is_connected,
        vector_store_connected=vector_store.is_connected,
        timestamp=datetime.now(timezone.utc),
    )
