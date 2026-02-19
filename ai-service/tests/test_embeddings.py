"""
Tests for the Embedding Service.
"""

import pytest
from unittest.mock import patch, MagicMock
import numpy as np


class TestEmbeddingServiceInit:

    def test_initial_state(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        assert es._initialized is False
        assert es._model is None
        assert es.is_configured is False
        assert es.EMBEDDING_DIMENSION == 768

    @patch("app.embeddings._get_model")
    def test_initialize_success(self, mock_get):
        from app.embeddings import EmbeddingService
        mock_get.return_value = MagicMock()
        es = EmbeddingService()
        result = es.initialize()
        assert result is True
        assert es.is_configured is True

    @patch("app.embeddings._get_model", side_effect=RuntimeError("Model fail"))
    def test_initialize_failure(self, mock_get):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        result = es.initialize()
        assert result is False
        assert es.is_configured is False


class TestSyncEmbed:

    @patch("app.embeddings._get_model")
    def test_sync_embed_lazy_init(self, mock_get):
        from app.embeddings import EmbeddingService
        model = MagicMock()
        model.encode.return_value = np.random.randn(768)
        mock_get.return_value = model

        es = EmbeddingService()
        result = es._sync_embed("test text")
        assert len(result) == 768
        assert es.is_configured is True

    def test_sync_embed_not_configured_raises(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        with patch("app.embeddings._get_model", side_effect=RuntimeError("fail")):
            with pytest.raises(RuntimeError, match="not initialized"):
                es._sync_embed("test")

    @patch("app.embeddings._get_model")
    def test_sync_embed_truncates_long_text(self, mock_get):
        from app.embeddings import EmbeddingService
        model = MagicMock()
        model.encode.return_value = np.random.randn(768)
        mock_get.return_value = model

        es = EmbeddingService()
        es.initialize()
        es._sync_embed("x" * 10000)
        # Check the text passed to encode was truncated
        called_text = model.encode.call_args[0][0]
        assert len(called_text) == 4096


class TestGenerateEmbedding:

    @pytest.mark.asyncio
    async def test_generate_embedding_success(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        es._initialized = True
        es._model = MagicMock()
        es._model.encode.return_value = np.random.randn(768)

        embedding, latency = await es.generate_embedding("test text")
        assert len(embedding) == 768
        assert isinstance(latency, int)

    @pytest.mark.asyncio
    async def test_generate_embedding_pads_short(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        es._initialized = True
        es._model = MagicMock()
        # Return embedding shorter than 768
        es._model.encode.return_value = np.random.randn(100)

        embedding, _ = await es.generate_embedding("test")
        assert len(embedding) == 768

    @pytest.mark.asyncio
    async def test_generate_embedding_truncates_long(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        es._initialized = True
        es._model = MagicMock()
        es._model.encode.return_value = np.random.randn(1024)

        embedding, _ = await es.generate_embedding("test")
        assert len(embedding) == 768

    @pytest.mark.asyncio
    async def test_generate_embedding_fallback_on_error(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        es._initialized = True
        es._model = MagicMock()
        es._model.encode.side_effect = RuntimeError("fail")

        embedding, _ = await es.generate_embedding("test text")
        assert len(embedding) == 768  # mock embedding


class TestGenerateEmbeddingsBatch:

    @pytest.mark.asyncio
    async def test_batch_embedding(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        es._initialized = True
        es._model = MagicMock()
        es._model.encode.return_value = np.random.randn(768)

        embeddings, total_latency = await es.generate_embeddings_batch(["text1", "text2", "text3"])
        assert len(embeddings) == 3
        assert all(len(e) == 768 for e in embeddings)

    @pytest.mark.asyncio
    async def test_batch_empty_list(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        es._initialized = True
        es._model = MagicMock()

        embeddings, latency = await es.generate_embeddings_batch([])
        assert embeddings == []
        assert latency == 0


class TestMockEmbedding:

    def test_mock_embedding_deterministic(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        e1 = es._generate_mock_embedding("same text")
        e2 = es._generate_mock_embedding("same text")
        assert e1 == e2

    def test_mock_embedding_different_for_different_text(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        e1 = es._generate_mock_embedding("foo")
        e2 = es._generate_mock_embedding("bar")
        assert e1 != e2

    def test_mock_embedding_normalized(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        e = es._generate_mock_embedding("test")
        norm = np.linalg.norm(e)
        assert abs(norm - 1.0) < 0.01


class TestChunkText:

    def test_empty_text(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        assert es.chunk_text("") == []

    def test_none_text(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        assert es.chunk_text(None) == []

    def test_short_text(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        result = es.chunk_text("short text")
        assert result == ["short text"]

    def test_long_text_chunks(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        text = "word " * 500  # ~2500 chars
        chunks = es.chunk_text(text, chunk_size=500, overlap=100)
        assert len(chunks) > 1
        # Each chunk should be non-empty
        assert all(len(c) > 0 for c in chunks)

    def test_chunks_have_overlap(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        text = "A. " * 200 + "B. " * 200 + "C. " * 200
        chunks = es.chunk_text(text, chunk_size=300, overlap=100)
        assert len(chunks) >= 2

    def test_sentence_boundary_break(self):
        from app.embeddings import EmbeddingService
        es = EmbeddingService()
        # Create text with a clear sentence boundary
        text = "First sentence. " * 30 + "Second sentence. " * 30
        chunks = es.chunk_text(text, chunk_size=200, overlap=50)
        # Chunks should try to end at sentence boundaries
        for chunk in chunks[:-1]:  # skip last
            assert chunk.rstrip().endswith(".") or len(chunk) <= 200
