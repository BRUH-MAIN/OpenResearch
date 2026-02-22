"""Embedding-based intent classifier for agentic routing."""

from __future__ import annotations

import logging
import time
from typing import Optional
import re

import numpy as np

from .embeddings import embedding_service

logger = logging.getLogger(__name__)


INTENT_THRESHOLD = 0.85

INTENT_PHRASES: dict[str, list[str]] = {
    # --- Deep Research ---
    "deep_research": [
        "deep research",
        "perform deep research",
        "in-depth survey",
        "comprehensive synthesis",
        "multi-hop literature review",
        "systematic review",
        "detailed literature review",
        "explore the topic in depth",
        "thorough analysis of the field",
    ],
    # --- Paper Retrieval ---
    "paper_retrieval": [
        "find papers about",
        "search for papers on",
        "retrieve papers",
        "get papers related to",
        "look up papers",
        "find research articles",
        "fetch publications on",
        "discover papers about",
        "search the literature for",
        "find relevant papers",
    ],
    # --- Literature Survey ---
    "literature_survey": [
        "literature review on",
        "survey the field of",
        "summarize the state of research",
        "overview of existing work",
        "review related work on",
        "survey of prior studies",
        "synthesize existing literature",
        "what is known about",
        "state of the art in",
        "review the body of work on",
    ],
    # --- Gap Analysis ---
    "gap_analysis": [
        "identify research gaps",
        "what areas are underexplored",
        "find gaps in the literature",
        "what is missing in research on",
        "analyze research gaps",
        "unexplored areas in",
        "open problems in",
        "research gap analysis",
        "unresolved questions in",
        "where is more work needed",
    ],
    # --- Fact Check ---
    "fact_check": [
        "verify the claim",
        "is it true that",
        "fact check",
        "check the accuracy of",
        "validate this statement",
        "confirm whether",
        "is this claim supported",
        "verify this finding",
        "check if the evidence supports",
        "evaluate the truthfulness of",
    ],
    # --- Novelty Assessment ---
    "novelty_assessment": [
        "how novel is",
        "assess novelty of",
        "is this idea new",
        "novelty check",
        "has this been done before",
        "how original is this approach",
        "evaluate the novelty",
        "compare to existing work for novelty",
        "is this a new contribution",
        "assess the originality of",
    ],
    # --- Research Mentor ---
    "research_mentor": [
        "advise me on",
        "how should I approach",
        "mentorship on",
        "guide me through",
        "give me research advice",
        "what methodology should I use",
        "help me design my study",
        "suggest a research direction",
        "how do I improve my research",
        "mentor me on",
    ],
    # --- Paper Writing ---
    "paper_writing": [
        "help write a paper",
        "draft a paper about",
        "write an abstract for",
        "compose a research paper",
        "draft the introduction for",
        "write the related work section",
        "help me write a manuscript",
        "paper writing assistance",
        "generate a paper outline",
        "draft a conclusion for",
    ],
    # --- Research Planning ---
    "research_planning": [
        "plan my research",
        "create a research timeline",
        "research roadmap",
        "design a research plan",
        "outline my research strategy",
        "plan the next steps for my research",
        "create a study plan",
        "develop a research agenda",
        "project planning for research",
        "milestone plan for my project",
    ],
}


# Pre-computed embeddings

_intent_embeddings: dict[str, list[np.ndarray]] = {}
_initialized = False

def _ensure_initialized() -> None:
    global _initialized, _intent_embeddings
    if _initialized:
        return
    if not embedding_service.is_configured:
        return
    start = time.time()
    for intent, phrases in INTENT_PHRASES.items():
        embeddings = []
        for phrase in phrases:
            emb = embedding_service._sync_embed(phrase)
            if emb is not None:
                embeddings.append(np.array(emb))
        _intent_embeddings[intent] = embeddings
    _initialized = True
    elapsed_ms = int((time.time() - start) * 1000)
    logger.info(
        "Intent classifier initialized: %d intents, %d phrases in %dms",
        len(_intent_embeddings),
        sum(len(v) for v in _intent_embeddings.values()),
        elapsed_ms,
    )


def eager_initialize() -> bool:
    """Eagerly pre-compute intent embeddings at startup.

    Call this during application startup (after embedding_service is ready)
    to avoid cold-start latency on the first classification request.
    Returns True if initialization succeeded.
    """
    _ensure_initialized()
    return _initialized


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def _clean_prompt(prompt: str) -> str:
    """Strip @ai trigger and extra whitespace from the prompt."""
    cleaned = re.sub(r"@ai\b", "", prompt, flags=re.IGNORECASE).strip()
    return cleaned


def classify_intent(prompt: str) -> tuple[Optional[str], float, Optional[str]]:
    """Classify the agentic intent of a prompt.

    Returns ``(intent_name, similarity, matched_phrase)`` or
    ``(None, similarity, None)`` if below threshold.
    """
    _ensure_initialized()

    cleaned = _clean_prompt(prompt)
    if not cleaned:
        return None, 0.0, None

    query_emb = embedding_service._sync_embed(cleaned)
    if query_emb is None:
        return None, 0.0, None

    query_vec = np.array(query_emb)

    best_intent: Optional[str] = None
    best_score = 0.0
    best_phrase: Optional[str] = None

    for intent, embeddings in _intent_embeddings.items():
        phrases = INTENT_PHRASES[intent]
        for emb, phrase in zip(embeddings, phrases):
            score = _cosine_similarity(query_vec, emb)
            if score > best_score:
                best_score = score
                best_intent = intent
                best_phrase = phrase

    if best_score >= INTENT_THRESHOLD:
        return best_intent, best_score, best_phrase

    return None, best_score, None