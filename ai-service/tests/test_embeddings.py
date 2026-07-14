"""Embedding service: request shape, batching, retries, and graceful degradation.

Every Gemini call is mocked with respx — the suite never touches a paid API.
"""

import httpx
import pytest
import respx

from app.embeddings import EmbeddingService, MAX_BATCH_SIZE

EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent"
BATCH_URL = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents"


@pytest.fixture
def service(monkeypatch):
    svc = EmbeddingService()
    svc._initialized = True
    svc._api_key = "test-key"
    svc._model = "text-embedding-004"
    return svc


def vector(fill: float = 0.1) -> list[float]:
    return [fill] * 768


class TestGenerateEmbedding:
    @respx.mock
    async def test_returns_768_dimensional_vector(self, service):
        respx.post(url__startswith=EMBED_URL).mock(
            return_value=httpx.Response(200, json={"embedding": {"values": vector()}})
        )

        embedding, latency_ms = await service.generate_embedding("attention is all you need")

        assert len(embedding) == 768
        assert latency_ms >= 0

    @respx.mock
    async def test_sends_the_task_type_through(self, service):
        route = respx.post(url__startswith=EMBED_URL).mock(
            return_value=httpx.Response(200, json={"embedding": {"values": vector()}})
        )

        await service.generate_embedding("a query", task_type="RETRIEVAL_QUERY")

        body = route.calls.last.request.read().decode()
        assert "RETRIEVAL_QUERY" in body

    @respx.mock
    async def test_pads_a_short_vector_to_the_column_width(self, service):
        # The pgvector column is fixed at 768; a short vector must not reach it.
        respx.post(url__startswith=EMBED_URL).mock(
            return_value=httpx.Response(200, json={"embedding": {"values": [0.5] * 100}})
        )

        embedding, _ = await service.generate_embedding("text")

        assert len(embedding) == 768

    @respx.mock
    async def test_retries_a_rate_limit_then_succeeds(self, service):
        route = respx.post(url__startswith=EMBED_URL).mock(
            side_effect=[
                httpx.Response(429, json={"error": "rate limited"}),
                httpx.Response(200, json={"embedding": {"values": vector()}}),
            ]
        )

        embedding, _ = await service.generate_embedding("text")

        assert route.call_count == 2
        assert len(embedding) == 768

    @respx.mock
    async def test_falls_back_to_a_deterministic_vector_when_the_api_is_down(self, service):
        respx.post(url__startswith=EMBED_URL).mock(
            return_value=httpx.Response(500, json={"error": "boom"})
        )

        first, _ = await service.generate_embedding("same text")
        second, _ = await service.generate_embedding("same text")

        # Degraded, not crashed — and stable, so retrieval stays deterministic.
        assert len(first) == 768
        assert first == second


class TestGenerateEmbeddingsBatch:
    @respx.mock
    async def test_embeds_many_texts_in_one_request(self, service):
        route = respx.post(url__startswith=BATCH_URL).mock(
            return_value=httpx.Response(
                200, json={"embeddings": [{"values": vector()} for _ in range(3)]}
            )
        )

        embeddings, _ = await service.generate_embeddings_batch(["a", "b", "c"])

        assert len(embeddings) == 3
        assert route.call_count == 1  # one round-trip, not three

    @respx.mock
    async def test_splits_oversized_batches(self, service):
        count = MAX_BATCH_SIZE + 10
        route = respx.post(url__startswith=BATCH_URL).mock(
            side_effect=[
                httpx.Response(
                    200,
                    json={"embeddings": [{"values": vector()} for _ in range(MAX_BATCH_SIZE)]},
                ),
                httpx.Response(
                    200, json={"embeddings": [{"values": vector()} for _ in range(10)]}
                ),
            ]
        )

        embeddings, _ = await service.generate_embeddings_batch(["t"] * count)

        assert len(embeddings) == count
        assert route.call_count == 2

    async def test_empty_input_makes_no_request(self, service):
        embeddings, latency = await service.generate_embeddings_batch([])

        assert embeddings == []
        assert latency == 0


class TestChunkText:
    def test_short_text_is_one_chunk(self, service):
        assert service.chunk_text("short") == ["short"]

    def test_empty_text_yields_no_chunks(self, service):
        assert service.chunk_text("") == []

    def test_long_text_is_split_with_overlap(self, service):
        text = "word " * 1000  # ~5000 chars

        chunks = service.chunk_text(text, chunk_size=1000, overlap=200)

        assert len(chunks) > 1
        assert all(len(c) <= 1200 for c in chunks)

    def test_prefers_sentence_boundaries(self, service):
        text = ("A" * 900) + ". " + ("B" * 900)

        chunks = service.chunk_text(text, chunk_size=1000, overlap=100)

        # The break should land after the period, not mid-word.
        assert chunks[0].endswith(".")


class TestConfiguration:
    def test_is_unconfigured_without_an_api_key(self, monkeypatch):
        svc = EmbeddingService()
        monkeypatch.setattr("app.embeddings.get_settings", lambda: type("S", (), {
            "gemini_api_key": "", "gemini_embedding_model": "text-embedding-004"
        })())

        assert svc.initialize() is False
        assert svc.is_configured is False
