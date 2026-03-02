"""Embedding-space gap finder — geometric detection of understudied research areas."""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


async def find_embedding_space_gaps(
    paper_embeddings: list[dict],
    query: str,
    llm_call,
) -> list[dict]:
    """Cluster paper embeddings and identify sparse regions as research gaps.

    Args:
        paper_embeddings: list of dicts with keys ``embedding`` (list[float]) and
                          ``paper`` (dict with at least ``title``).
        query: the user's research query.
        llm_call: async callable(system_prompt, user_prompt) -> str

    Returns:
        Sorted list of gap dicts with ``gap``, ``questions``, ``severity``,
        ``paper_count``, ``representative_papers``.
    """
    if len(paper_embeddings) < 5:
        return []

    try:
        from sklearn.cluster import KMeans
    except ImportError:
        logger.warning("scikit-learn not installed — embedding gap finder disabled")
        return []

    embeddings = np.array([p["embedding"] for p in paper_embeddings])
    papers = [p["paper"] for p in paper_embeddings]

    k = min(max(3, int(np.sqrt(len(papers)))), 10)

    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = kmeans.fit_predict(embeddings)

    cluster_sizes = np.bincount(labels, minlength=k)
    sparse_threshold = max(np.percentile(cluster_sizes, 30), 1)
    sparse_clusters = np.where(cluster_sizes <= sparse_threshold)[0]

    gap_descriptions: list[dict] = []

    for cluster_idx in sparse_clusters:
        cluster_papers = [papers[i] for i, lbl in enumerate(labels) if lbl == cluster_idx]
        if not cluster_papers:
            continue

        cluster_titles = "\n".join([p.get("title", "Untitled") for p in cluster_papers[:5]])
        gap_prompt = (
            f"These papers represent an understudied cluster in the research space:\n"
            f"{cluster_titles}\n\n"
            f"Based on these papers and the research query \"{query}\":\n"
            "1. What specific research gap does this sparse cluster represent?\n"
            "2. What questions remain unanswered in this area?\n"
            "3. Rate the severity: low / medium / high\n\n"
            'Respond in JSON: {"gap": "...", "questions": ["..."], "severity": "..."}'
        )

        try:
            raw = await llm_call(
                "You are a research gap analyst. Return ONLY valid JSON.",
                gap_prompt,
            )
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned)
            gap_data = json.loads(cleaned)
            gap_descriptions.append({
                **gap_data,
                "paper_count": len(cluster_papers),
                "representative_papers": [p.get("title", "Untitled") for p in cluster_papers[:3]],
            })
        except Exception as exc:
            logger.warning("Gap description LLM failed for cluster %d: %s", cluster_idx, exc)
            continue

    severity_order = {"high": 0, "medium": 1, "low": 2}
    gap_descriptions.sort(key=lambda x: severity_order.get(x.get("severity", "low"), 2))

    return gap_descriptions
