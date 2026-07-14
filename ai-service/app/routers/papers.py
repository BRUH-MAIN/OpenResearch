"""Paper ingestion, Q&A, and summarization."""

import io
import logging
import time
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from ..database import database
from ..deps import (
    build_sources,
    get_group_context,
    require_llm,
    require_vector_store,
    store_ai_artifact,
    strip_trigger,
    validate_ai_trigger,
    validate_uuid,
)
from ..llm_client import llm_client
from ..models import (
    AddPaperResponse,
    AddPaperToGroupRequest,
    ErrorResponse,
    PaperAnswerResponse,
    PaperQuestionRequest,
    PaperSummarizeRequest,
    PaperSummaryResponse,
)
from ..vector_store import vector_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Papers"])

RESPONSES = {
    400: {"model": ErrorResponse, "description": "Missing @ai trigger"},
    503: {"model": ErrorResponse, "description": "AI service not configured"},
}

QA_SYSTEM_INSTRUCTION = """You are an expert AI research assistant helping researchers understand academic papers.
Use a structured chain-of-thought approach:

1. **Identify**: Which retrieved passages are most relevant to the question?
2. **Analyze**: What do those passages say? Quote or paraphrase key phrases.
3. **Synthesize**: Combine evidence into a coherent answer.
4. **Cite**: Reference source numbers (e.g., [Source 1]) so the user can verify.
5. **Gaps**: If information is incomplete, state what is missing.

Format your answer with clear sections. Be precise and cite sources."""

SUMMARY_SYSTEM_INSTRUCTION = """You are an AI research assistant that creates concise summaries of academic papers.
Provide a structured summary with:
1. Main contribution (1-2 sentences)
2. Key findings (3-5 bullet points)
3. Methodology overview (1 paragraph)
4. Implications (1-2 sentences)"""


# A paper's text is what gets chunked and embedded, so cap it: a pathological
# PDF should not turn into thousands of embedding calls.
MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_EXTRACTED_CHARS = 500_000


@router.post("/papers/extract-text", summary="Extract text from an uploaded PDF")
async def extract_pdf_text(file: UploadFile = File(...)) -> dict:
    """Pull the text out of a PDF so it can be chunked and embedded.

    Text extraction lives here rather than in the Node server because pypdf is
    a Python library — but the extracted text is handed straight back, and the
    server is what writes it to the database (see docs/adr/0001).
    """
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF uploads are supported.",
        )

    contents = await file.read()
    if len(contents) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"PDF exceeds the {MAX_PDF_BYTES // (1024 * 1024)}MB limit.",
        )

    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(contents))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        logger.warning("PDF extraction failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read this PDF. It may be corrupt or image-only.",
        )

    text = "\n\n".join(p.strip() for p in pages if p.strip())

    if not text:
        # A scanned PDF has no text layer; OCR is out of scope.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No selectable text found. Scanned PDFs are not supported.",
        )

    truncated = len(text) > MAX_EXTRACTED_CHARS
    return {
        "text": text[:MAX_EXTRACTED_CHARS],
        "page_count": len(reader.pages),
        "char_count": min(len(text), MAX_EXTRACTED_CHARS),
        "truncated": truncated,
    }


@router.post(
    "/groups/{group_id}/papers",
    response_model=AddPaperResponse,
    summary="Add paper to group and embed",
)
async def add_paper_to_group(group_id: str, request: AddPaperToGroupRequest) -> AddPaperResponse:
    """Chunk, embed, and store a paper in the group's vector namespace."""
    validate_uuid(group_id, "group_id")
    if request.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id in body must match path.",
        )
    require_vector_store()

    try:
        vector_ids = await vector_store.insert_paper_chunks(
            group_id=group_id,
            paper_id=request.paper_id,
            title=request.title,
            abstract=request.abstract,
            full_text=request.full_text,
            metadata={"added_by": request.user_id, **(request.metadata or {})},
        )
    except Exception as exc:
        logger.error("Paper ingestion failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add paper.",
        )

    return AddPaperResponse(
        success=True,
        paper_id=request.paper_id,
        group_id=group_id,
        vectors_created=len(vector_ids),
        message=f"Paper added to group with {len(vector_ids)} vector embeddings.",
    )


@router.post(
    "/papers/question",
    response_model=PaperAnswerResponse,
    responses=RESPONSES,
    summary="Ask a question about a paper",
)
async def paper_question(request: PaperQuestionRequest) -> PaperAnswerResponse:
    """Answer a question about one paper, grounded in its retrieved passages."""
    validate_uuid(request.group_id, "group_id")
    validate_ai_trigger(request.question, "question")
    require_llm()

    start_time = time.time()
    query = strip_trigger(request.question)

    chunks, vector_ids = await get_group_context(
        group_id=request.group_id,
        query=query,
        limit=10,
        content_types=["paper"],
    )

    # Only passages from the paper being asked about.
    paper_chunks = [item for item in chunks if item["paper_id"] == request.paper_id]

    paper_info = None
    if database.is_connected:
        paper_info = await database.get_paper_info(request.paper_id)

    context_parts = []
    if paper_info:
        context_parts.append(f"## Paper: {paper_info.get('title', 'Unknown')}")
        context_parts.append(f"Authors: {', '.join(paper_info.get('authors', []))}")
        context_parts.append(f"Abstract: {paper_info.get('abstract', '')}")

    if paper_chunks:
        passages = "\n".join(
            f"[Source {i + 1} | chunk {chunk['chunk_index']} | sim={chunk.get('similarity', 0):.3f}]: "
            f"{chunk['content'][:600]}"
            for i, chunk in enumerate(paper_chunks[:10])
        )
        context_parts.append(f"## Retrieved Passages\n{passages}")

    context = "\n\n".join(context_parts) if context_parts else "No paper context found."

    prompt = f"""Paper Context:
{context}

---

Question: {request.question}

Think step-by-step using the retrieved passages, then provide a comprehensive answer."""

    try:
        answer, _ = await llm_client.generate(
            prompt=prompt,
            system_instruction=QA_SYSTEM_INSTRUCTION,
            temperature=0.3,
            max_tokens=1536,
        )
    except Exception as exc:
        logger.error("Paper Q&A generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI generation failed.",
        )

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
            "num_chunks_used": len(paper_chunks),
        },
    )

    return PaperAnswerResponse(
        id=artifact_id or str(uuid.uuid4()),
        answer=answer,
        paper_id=request.paper_id,
        sources=build_sources(paper_chunks, limit=8),
        metadata={
            "model": llm_client.model_name,
            "paper_title": paper_info.get("title") if paper_info else None,
            "retrieval_method": "hybrid",
        },
        latency_ms=int((time.time() - start_time) * 1000),
    )


@router.post(
    "/papers/summarize",
    response_model=PaperSummaryResponse,
    responses=RESPONSES,
    summary="Generate paper summary",
)
async def paper_summarize(request: PaperSummarizeRequest) -> PaperSummaryResponse:
    """Summarize a paper from its stored chunks."""
    validate_uuid(request.group_id, "group_id")
    validate_ai_trigger(request.trigger, "trigger")
    require_llm()

    start_time = time.time()

    chunks, _ = await get_group_context(
        group_id=request.group_id,
        query="full paper content summary abstract",
        limit=20,
        content_types=["paper"],
    )
    paper_chunks = [item for item in chunks if item["paper_id"] == request.paper_id]

    paper_info = None
    if database.is_connected:
        paper_info = await database.get_paper_info(request.paper_id)

    if not paper_info and not paper_chunks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found in group context.",
        )

    context_parts = []
    if paper_info:
        context_parts.append(f"Title: {paper_info.get('title', 'Unknown')}")
        context_parts.append(f"Authors: {', '.join(paper_info.get('authors', []))}")
        context_parts.append(f"Abstract: {paper_info.get('abstract', '')}")
    if paper_chunks:
        body = "\n\n".join(chunk["content"] for chunk in paper_chunks)
        context_parts.append(f"Paper Content:\n{body}")

    prompt = f"""{chr(10).join(context_parts)}

---

Generate a comprehensive summary of this paper."""

    try:
        summary_text, _ = await llm_client.generate(
            prompt=prompt,
            system_instruction=SUMMARY_SYSTEM_INSTRUCTION,
            temperature=0.3,
            max_tokens=1500,
        )
    except Exception as exc:
        logger.error("Summary generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI generation failed.",
        )

    key_points = [
        line.strip().lstrip("-•* ")
        for line in summary_text.split("\n")
        if line.strip().startswith(("-", "•", "*"))
    ]

    artifact_id = await store_ai_artifact(
        group_id=request.group_id,
        artifact_type="summary",
        content=summary_text,
        paper_id=request.paper_id,
        session_id=request.session_id,
        user_id=request.user_id,
        metadata={"paper_title": paper_info.get("title") if paper_info else None},
    )

    return PaperSummaryResponse(
        id=artifact_id or str(uuid.uuid4()),
        summary=summary_text,
        key_points=key_points[:5],
        paper_id=request.paper_id,
        metadata={
            "model": llm_client.model_name,
            "paper_title": paper_info.get("title") if paper_info else None,
        },
        latency_ms=int((time.time() - start_time) * 1000),
    )
