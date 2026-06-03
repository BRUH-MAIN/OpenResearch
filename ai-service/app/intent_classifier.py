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
        "are the latest models based on",
        "what approaches are used in",
        "what techniques are common in",
        "compare different methods for",
        "what are the main approaches to",
        "classify the types of",
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
        "what are the next steps",
        "what should I do next",
        "next steps for this research",
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
    # --- Structured Comparison ---
    "methodology_extraction": [
        "compare methodologies across papers",
        "extract study designs",
        "methodology matrix",
        "compare sample sizes",
        "research design comparison",
        "extract methodology from papers",
        "what methods were used",
        "compare statistical approaches",
        "methodology comparison table",
        "compare architectures across papers",
        "build a comparison matrix",
        "extract structured fields from papers",
        "compare datasets metrics and methods",
        "make a structured comparison table",
    ],
    # --- Reviewer Anticipation ---
    "reviewer_anticipation": [
        "anticipate reviewer questions",
        "what will reviewers ask",
        "address potential reviewer concerns",
        "reviewer objections",
        "prepare for peer review",
        "what criticisms might reviewers have",
        "strengthen against reviewer feedback",
        "identify weaknesses reviewers might find",
        "simulate peer review",
        "how would reviewers critique this",
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


def _compute_intent_scores(prompt: str) -> list[tuple[str, float, str]]:
    """Compute similarity scores for ALL intents against a prompt.

    Returns a sorted list of ``(intent_name, score, matched_phrase)``
    ordered by descending score.
    """
    _ensure_initialized()

    cleaned = _clean_prompt(prompt)
    if not cleaned:
        return []

    query_emb = embedding_service._sync_embed(cleaned)
    if query_emb is None:
        return []

    query_vec = np.array(query_emb)

    # Collect best score per intent
    intent_best: dict[str, tuple[float, str]] = {}
    for intent, embeddings in _intent_embeddings.items():
        phrases = INTENT_PHRASES[intent]
        for emb, phrase in zip(embeddings, phrases):
            score = _cosine_similarity(query_vec, emb)
            if intent not in intent_best or score > intent_best[intent][0]:
                intent_best[intent] = (score, phrase)

    ranked = [
        (intent, score, phrase)
        for intent, (score, phrase) in intent_best.items()
    ]
    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked


def classify_intent_detailed(prompt: str) -> dict:
    """Extended intent classification with ambiguity detection.

    Returns a dict with ``intent``, ``confidence``, ``ambiguous``,
    ``fallback``, ``matched_phrase``, and ``alternatives``.
    """
    ranked = _compute_intent_scores(prompt)
    if not ranked:
        return {
            "intent": None,
            "confidence": 0.0,
            "ambiguous": False,
            "fallback": True,
            "matched_phrase": None,
            "alternatives": [],
        }

    best_intent, best_score, best_phrase = ranked[0]
    is_ambiguous = 0.75 <= best_score < INTENT_THRESHOLD
    is_fallback = best_score < 0.75

    alternatives = [
        {"intent": r[0], "confidence": round(r[1], 4)}
        for r in ranked[1:4]
    ]

    return {
        "intent": best_intent if best_score >= 0.75 else None,
        "confidence": round(best_score, 4),
        "ambiguous": is_ambiguous,
        "fallback": is_fallback,
        "matched_phrase": best_phrase,
        "alternatives": alternatives,
    }


def classify_intent(prompt: str) -> tuple[Optional[str], float, Optional[str]]:
    """Classify the agentic intent of a prompt.

    Returns ``(intent_name, similarity, matched_phrase)`` or
    ``(None, similarity, None)`` if below threshold.
    """
    ranked = _compute_intent_scores(prompt)
    if not ranked:
        return None, 0.0, None

    best_intent, best_score, best_phrase = ranked[0]

    if best_score >= INTENT_THRESHOLD:
        return best_intent, best_score, best_phrase

    # When below threshold, check if we have a close runner-up that
    # is a safer default.
    _PREFER_OVER: dict[str, list[str]] = {
        "fact_check": ["literature_survey"],
    }
    prefer_candidates = _PREFER_OVER.get(best_intent or "", [])
    if best_intent and prefer_candidates and best_score >= (INTENT_THRESHOLD - 0.05):
        for r_intent, r_score, r_phrase in ranked[1:]:
            if r_intent in prefer_candidates and r_score >= (best_score - 0.05):
                logger.info(
                    "Intent preference override: %s (%.3f) -> %s (%.3f)",
                    best_intent, best_score, r_intent, r_score,
                )
                return r_intent, r_score, r_phrase

    return None, best_score, None