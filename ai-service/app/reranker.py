"""Cross-encoder reranker for improving retrieval precision.

Uses a lightweight cross-encoder model to rerank candidate results
by scoring query-document pairs jointly.
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_cross_encoder = None


def _get_cross_encoder():
    """Lazy-load the cross-encoder model."""
    global _cross_encoder
    if _cross_encoder is None:
        try:
            from sentence_transformers import CrossEncoder
            logger.info("Loading cross-encoder reranker model...")
            _cross_encoder = CrossEncoder(
                "cross-encoder/ms-marco-MiniLM-L-6-v2",
                max_length=512,
            )
            logger.info("Cross-encoder reranker loaded successfully")
        except Exception as exc:
            logger.warning("Failed to load cross-encoder: %s", exc)
    return _cross_encoder


class RerankerService:
    """Rerank retrieval results using a cross-encoder for higher precision."""

    def __init__(self):
        self._initialized = False
        self._model = None

    def initialize(self) -> bool:
        """Initialize the reranker model. Returns True if successful."""
        try:
            self._model = _get_cross_encoder()
            self._initialized = self._model is not None
            if self._initialized:
                logger.info("Reranker service initialized")
            return self._initialized
        except Exception as exc:
            logger.error("Failed to initialize reranker: %s", exc)
            return False

    @property
    def is_available(self) -> bool:
        return self._initialized and self._model is not None

    def _sync_rerank(
        self,
        query: str,
        documents: list[str],
    ) -> list[float]:
        """
        Score query-document pairs using cross-encoder (synchronous).

        Returns list of relevance scores (higher = more relevant).
        """
        if not self._model:
            self.initialize()
            if not self._model:
                # Return uniform scores if model unavailable
                return [0.0] * len(documents)

        pairs = [[query, doc] for doc in documents]
        scores = self._model.predict(pairs)
        return scores.tolist()

    async def rerank(
        self,
        query: str,
        results: list[dict],
        top_k: int = 10,
        content_key: str = "snippet",
    ) -> list[dict]:
        """
        Rerank results using cross-encoder scores.

        Args:
            query: The search query
            results: List of result dicts, each must have `content_key` field
            top_k: Number of top results to return
            content_key: Key in result dict containing the text to score

        Returns:
            Reranked results with added 'rerank_score' field
        """
        if not results:
            return []

        if not self.is_available:
            self.initialize()

        if not self.is_available:
            # Graceful fallback: return results as-is
            logger.debug("Reranker unavailable, returning results unranked")
            return results[:top_k]

        documents = [r.get(content_key, "") for r in results]

        # Run sync inference in thread pool
        scores = await asyncio.to_thread(
            self._sync_rerank, query, documents
        )

        # Attach scores and sort
        scored = []
        for result, score in zip(results, scores):
            result_copy = dict(result)
            result_copy["rerank_score"] = float(score)
            scored.append(result_copy)

        scored.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored[:top_k]


# Singleton instance
reranker = RerankerService()
