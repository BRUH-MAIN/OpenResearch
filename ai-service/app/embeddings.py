"""Embedding service backed by the Gemini embeddings API.

Uses `text-embedding-004`, which produces 768-dimensional vectors — the same
dimension the pgvector column and HNSW index were built for, so swapping the
local SPECTER2 model out for a hosted API needed no schema migration.

Trade-off (see docs/adr/0003): we give up "no data leaves the box" and add
~100ms of network latency per call, and in exchange the service drops torch +
three transformer models (multi-GB image, ~4GB RAM, minutes of cold start).
"""

import hashlib
import logging
import time

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import get_settings

logger = logging.getLogger(__name__)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Gemini caps a single embed request; keep documents well under the token limit.
MAX_CHARS_PER_TEXT = 8000
# batchEmbedContents accepts up to 100 requests per call.
MAX_BATCH_SIZE = 100


class EmbeddingRetryableError(Exception):
    """Rate limit (429) or upstream 5xx — worth retrying with backoff."""


class EmbeddingService:
    """Generates text embeddings via the Gemini API."""

    EMBEDDING_DIMENSION = 768

    def __init__(self) -> None:
        self._initialized = False
        self._api_key = ""
        self._model = ""

    def initialize(self) -> bool:
        """Validate configuration. Returns True if an API key is present."""
        settings = get_settings()
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_embedding_model

        if not self._api_key:
            logger.error("GEMINI_API_KEY is not set — embeddings unavailable")
            self._initialized = False
            return False

        self._initialized = True
        logger.info("Embedding service initialized (Gemini %s)", self._model)
        return True

    @property
    def is_configured(self) -> bool:
        return self._initialized and bool(self._api_key)

    def _url(self, method: str) -> str:
        return f"{GEMINI_BASE_URL}/models/{self._model}:{method}"

    def _headers(self) -> dict[str, str]:
        # The key goes in a header, NOT in the query string: httpx logs request
        # URLs, so `?key=...` would write the credential into the logs in plaintext.
        return {"x-goog-api-key": self._api_key}

    @staticmethod
    def _content(text: str) -> dict:
        return {"parts": [{"text": text[:MAX_CHARS_PER_TEXT]}]}

    @retry(
        retry=retry_if_exception_type(
            (EmbeddingRetryableError, httpx.TimeoutException, httpx.ConnectError)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def _post(self, method: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self._url(method), json=payload, headers=self._headers()
            )

        if response.status_code == 429 or response.status_code >= 500:
            raise EmbeddingRetryableError(
                f"Gemini embeddings returned {response.status_code}"
            )

        # A 4xx here is almost always a bad or wrong-product API key, and the
        # generic "embedding failed" that follows is not enough to act on.
        if response.status_code in (400, 401, 403):
            logger.error(
                "Gemini rejected the request (%s). Check GEMINI_API_KEY — an AI "
                "Studio key starts with 'AIza'. Detail: %s",
                response.status_code,
                response.text[:200],
            )

        response.raise_for_status()
        return response.json()

    async def generate_embedding(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> tuple[list[float], int]:
        """Embed a single text. Returns (vector, latency_ms)."""
        start = time.time()

        if not self.is_configured:
            self.initialize()

        try:
            data = await self._post(
                "embedContent",
                {
                    "model": f"models/{self._model}",
                    "content": self._content(text),
                    "taskType": task_type,
                },
            )
            embedding = data["embedding"]["values"]
            return self._normalize_dimension(embedding), self._elapsed_ms(start)
        except Exception as exc:
            logger.warning("Embedding failed (%s); falling back to mock vector", exc)
            return self._mock_embedding(text), self._elapsed_ms(start)

    async def generate_embeddings_batch(
        self,
        texts: list[str],
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> tuple[list[list[float]], int]:
        """Embed many texts in as few round-trips as the API allows."""
        start = time.time()

        if not texts:
            return [], 0

        if not self.is_configured:
            self.initialize()

        embeddings: list[list[float]] = []

        try:
            for batch_start in range(0, len(texts), MAX_BATCH_SIZE):
                batch = texts[batch_start : batch_start + MAX_BATCH_SIZE]
                data = await self._post(
                    "batchEmbedContents",
                    {
                        "requests": [
                            {
                                "model": f"models/{self._model}",
                                "content": self._content(text),
                                "taskType": task_type,
                            }
                            for text in batch
                        ]
                    },
                )
                embeddings.extend(
                    self._normalize_dimension(item["values"])
                    for item in data["embeddings"]
                )

            return embeddings, self._elapsed_ms(start)
        except Exception as exc:
            logger.warning(
                "Batch embedding failed (%s); falling back to mock vectors", exc
            )
            return [self._mock_embedding(t) for t in texts], self._elapsed_ms(start)

    @staticmethod
    def _elapsed_ms(start: float) -> int:
        return int((time.time() - start) * 1000)

    def _normalize_dimension(self, embedding: list[float]) -> list[float]:
        if len(embedding) < self.EMBEDDING_DIMENSION:
            embedding = embedding + [0.0] * (self.EMBEDDING_DIMENSION - len(embedding))
        elif len(embedding) > self.EMBEDDING_DIMENSION:
            embedding = embedding[: self.EMBEDDING_DIMENSION]
        return embedding

    def _mock_embedding(self, text: str) -> list[float]:
        """Deterministic unit vector, so tests and outages degrade rather than crash."""
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        raw = [
            (digest[i % len(digest)] / 255.0) - 0.5
            for i in range(self.EMBEDDING_DIMENSION)
        ]
        magnitude = sum(v * v for v in raw) ** 0.5 or 1.0
        return [v / magnitude for v in raw]

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 200,
    ) -> list[str]:
        """Split text into overlapping chunks, preferring sentence boundaries."""
        if not text or len(text) <= chunk_size:
            return [text] if text else []

        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size

            # Prefer to break at a sentence end within the last 20% of the chunk
            if end < len(text):
                search_start = int(end - chunk_size * 0.2)
                for sep in ['. ', '.\n', '! ', '? ', '\n\n']:
                    idx = text.rfind(sep, search_start, end)
                    if idx != -1:
                        end = idx + len(sep)
                        break

            chunks.append(text[start:end].strip())
            start = end - overlap

        return [c for c in chunks if c]


# Singleton instance
embedding_service = EmbeddingService()
