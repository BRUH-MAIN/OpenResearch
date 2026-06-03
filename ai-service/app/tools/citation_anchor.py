"""Citation anchoring — post-process synthesis to attach per-sentence source citations."""

from __future__ import annotations

import logging
import re
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def _cosine_similarity_matrix(
    a: np.ndarray,
    b: np.ndarray,
) -> np.ndarray:
    """Compute cosine similarity between each pair of rows in *a* and *b*."""
    a_norm = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-10)
    b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-10)
    return a_norm @ b_norm.T


async def anchor_citations(
    synthesis: str,
    source_chunks: list[dict],
    embed_fn,
    threshold: float = 0.68,
    max_citations: int = 3,
) -> dict:
    """Post-process synthesis output to attach source citations per sentence.

    Args:
        synthesis: the synthesised text (plain or markdown)
        source_chunks: list of dicts with at least ``paper_id`` (or ``title``)
                       and either ``embedding`` (pre-computed) or ``content``.
        embed_fn: async callable(list[str]) -> list[list[float]]
        threshold: minimum cosine similarity to count as a citation
        max_citations: maximum citations per sentence

    Returns:
        {"sentences": [{"text": str, "source_ids": [str]}], "raw_text": str}
    """
    if not synthesis or not source_chunks:
        return {"sentences": [{"text": synthesis, "source_ids": []}], "raw_text": synthesis}

    # Split synthesis into sentences
    sentences = re.split(r"(?<=[.!?])\s+", synthesis.strip())
    sentences = [s for s in sentences if len(s) > 10]  # skip very short fragments

    if not sentences:
        return {"sentences": [{"text": synthesis, "source_ids": []}], "raw_text": synthesis}

    # Embed sentences
    sentence_embeddings = await embed_fn(sentences)
    sent_matrix = np.array(sentence_embeddings)

    # Build chunk embedding matrix
    chunk_embeddings = []
    chunk_ids = []
    for chunk in source_chunks:
        if "embedding" in chunk and chunk["embedding"]:
            chunk_embeddings.append(chunk["embedding"])
        elif "content" in chunk and chunk["content"]:
            emb_list = await embed_fn([chunk["content"]])
            chunk_embeddings.append(emb_list[0])
        else:
            continue
        chunk_ids.append(chunk.get("paper_id") or chunk.get("title") or chunk.get("id", ""))

    if not chunk_embeddings:
        return {
            "sentences": [{"text": s, "source_ids": []} for s in sentences],
            "raw_text": synthesis,
        }

    chunk_matrix = np.array(chunk_embeddings)

    # Compute similarity
    sim = _cosine_similarity_matrix(sent_matrix, chunk_matrix)

    annotated = []
    for i, sentence in enumerate(sentences):
        row = sim[i]
        top_indices = np.where(row > threshold)[0]
        top_indices = sorted(top_indices, key=lambda x: row[x], reverse=True)[:max_citations]
        source_ids = [chunk_ids[idx] for idx in top_indices]
        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_ids: list[str] = []
        for sid in source_ids:
            if sid not in seen:
                seen.add(sid)
                unique_ids.append(sid)
        annotated.append({"text": sentence, "source_ids": unique_ids})

    return {"sentences": annotated, "raw_text": synthesis}
