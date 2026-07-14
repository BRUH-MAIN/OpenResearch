"""Embedding service: request shape, batching, retries, and graceful degradation.

Every Gemini call is mocked with respx — the suite never touches a paid API.
"""

import json
import math

import httpx
import pytest
import respx

from app.embeddings import EmbeddingService, MAX_BATCH_SIZE

EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
BATCH_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents"


@pytest.fixture
def service(monkeypatch):
    svc = EmbeddingService()
    svc._initialized = True
    svc._api_key = "test-key"
    svc._model = "gemini-embedding-001"
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
    async def test_asks_for_768_of_the_models_3072_dimensions(self, service):
        # gemini-embedding-001 returns 3072 by default, which would not fit the
        # vector(768) column. The request must say so explicitly.
        route = respx.post(url__startswith=EMBED_URL).mock(
            return_value=httpx.Response(200, json={"embedding": {"values": vector()}})
        )

        await service.generate_embedding("text")

        body = json.loads(route.calls.last.request.content)
        assert body["outputDimensionality"] == 768

    @respx.mock
    async def test_normalises_the_truncated_vector_to_unit_length(self, service):
        # Truncating a Matryoshka embedding leaves it well short of unit length
        # (~0.59 from the real API). Similarity scores are only comparable once
        # it is normalised.
        raw = [0.5] * 768  # norm = sqrt(768 * 0.25) ≈ 13.86, nowhere near 1
        respx.post(url__startswith=EMBED_URL).mock(
            return_value=httpx.Response(200, json={"embedding": {"values": raw}})
        )

        embedding, _ = await service.generate_embedding("text")

        norm = math.sqrt(sum(x * x for x in embedding))
        assert norm == pytest.approx(1.0, abs=1e-6)

    @respx.mock
    async def test_sends_the_key_as_a_header_never_in_the_url(self, service):
        # httpx logs request URLs. A `?key=...` query parameter therefore writes
        # the API key into the logs in plaintext, which is how it leaks.
        route = respx.post(url__startswith=EMBED_URL).mock(
            return_value=httpx.Response(200, json={"embedding": {"values": vector()}})
        )

        await service.generate_embedding("text")

        request = route.calls.last.request
        assert "test-key" not in str(request.url)
        assert request.headers["x-goog-api-key"] == "test-key"

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
            "gemini_api_key": "", "gemini_embedding_model": "gemini-embedding-001"
        })())

        assert svc.initialize() is False
        assert svc.is_configured is False
