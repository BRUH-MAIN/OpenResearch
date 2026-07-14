"""Group activity reports (PDF via reportlab)."""

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from ..config import get_settings
from ..database import database
from ..deps import validate_ai_trigger, validate_uuid
from ..models import GenerateReportRequest, ReportResponse
from ..report_generator import report_generator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post(
    "/group/{group_id}/generate",
    response_model=ReportResponse,
    summary="Generate group report",
)
async def generate_report(group_id: str, request: GenerateReportRequest) -> ReportResponse:
    """Build a PDF summarising a group's papers, discussions, and AI artifacts."""
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

    group_info = await database.get_group_info(group_id)
    if not group_info:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    sessions = (
        await database.get_group_sessions_with_messages(group_id)
        if request.include_sessions
        else []
    )
    papers = await database.get_group_papers(group_id) if request.include_papers else []

    summaries: list[dict] = []
    qa_artifacts: list[dict] = []
    if request.include_summaries:
        artifacts = await database.get_group_artifacts(group_id)
        summaries = [
            a for a in artifacts if a["artifact_type"] in ("summary", "session_summary")
        ]
        qa_artifacts = [a for a in artifacts if a["artifact_type"] == "qa"]

    user_info = await database.get_user_info(request.user_id) if request.user_id else None
    generated_by = user_info.get("name", "Unknown") if user_info else "System"

    try:
        _, filename, file_size = report_generator.generate_group_report(
            group_id=group_id,
            group_name=group_info.get("name", "Unknown Group"),
            group_description=group_info.get("description", ""),
            sessions=sessions,
            papers=papers,
            summaries=summaries,
            qa_artifacts=qa_artifacts,
            memory_notes=[],
            generated_by=generated_by,
            include_sessions=request.include_sessions,
            include_papers=request.include_papers,
            include_summaries=request.include_summaries,
            custom_prompt=request.prompt,
        )
    except Exception as exc:
        logger.error("Report generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Report generation failed.",
        )

    return ReportResponse(
        id=str(uuid.uuid4()),
        url=f"/reports/{filename}",
        filename=filename,
        file_size=file_size,
        group_id=group_id,
        created_at=datetime.now(timezone.utc),
    )


@router.get("/{filename}", summary="Download report")
async def download_report(filename: str) -> FileResponse:
    """Serve a generated PDF. The Node server proxies this so the AI service
    stays unreachable from the browser."""
    reports_dir = Path(get_settings().reports_dir).resolve()

    # Resolve then confirm containment: a filename like "../../etc/passwd" must
    # not escape the reports directory.
    filepath = (reports_dir / filename).resolve()
    if not filepath.is_relative_to(reports_dir) or not filepath.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    return FileResponse(path=str(filepath), filename=filename, media_type="application/pdf")
