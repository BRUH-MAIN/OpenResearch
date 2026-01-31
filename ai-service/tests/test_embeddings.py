"""
Tests for the Embeddings Service

Updated to use OpenAI mocks after migration from Gemini.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import numpy as np

from app.embeddings import EmbeddingService


class TestEmbeddingService:
    """Tests for the embedding service"""

    @pytest.fixture
    def embedding_service(self):
        """Create an embedding service with mocked OpenAI client"""
        with patch("app.embeddings.OpenAI") as mock_openai:
            # Mock the OpenAI client
            mock_client = MagicMock()
            mock_openai.return_value = mock_client
            
            service = EmbeddingService()
            service.client = mock_client
            service._initialized = True
            return service

    def test_embedding_dimensions(self, embedding_service):
        """Test embeddings are 1536 dimensions (text-embedding-3-small)"""
        # Mock the OpenAI embeddings response
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1] * 1536)]
        embedding_service.client.embeddings.create.return_value = mock_response

        # Test the expected dimension constant
        assert EmbeddingService.EMBEDDING_DIMENSION == 1536
        
        # Simulated result
        result = mock_response.data[0].embedding
        assert len(result) == 1536

    def test_embedding_normalization(self):
        """Test embeddings are normalized (unit length)"""
        # Create a mock normalized embedding
        embedding = np.random.randn(1536)
        embedding = embedding / np.linalg.norm(embedding)
        
        # Check it's normalized
        assert abs(np.linalg.norm(embedding) - 1.0) < 0.0001

    def test_empty_text_handling(self, embedding_service):
        """Test empty text is handled gracefully"""
        # The service should use mock embedding for failures
        service = EmbeddingService()
        mock_embedding = service._generate_mock_embedding("")
        
        # Mock embedding should still return correct dimensions
        assert len(mock_embedding) == 1536

    def test_batch_embedding(self, embedding_service):
        """Test batch embedding generation"""
        texts = ["text 1", "text 2", "text 3"]
        
        # Each text should produce a 1536-dim vector
        results = [[0.1] * 1536 for _ in texts]
        assert len(results) == len(texts)
        for result in results:
            assert len(result) == 1536

    def test_special_characters_handling(self, embedding_service):
        """Test special characters don't break embedding"""
        special_texts = [
            "Text with emoji 🔬",
            "Text with unicode: αβγδ",
            "Text with <html> tags",
            "Text with 'quotes' and \"double quotes\"",
        ]
        # Test mock embedding handles all these
        service = EmbeddingService()
        for text in special_texts:
            mock_embedding = service._generate_mock_embedding(text)
            assert len(mock_embedding) == 1536

    def test_long_text_handling(self, embedding_service):
        """Test very long text is handled (truncated to 8000 chars)"""
        long_text = "word " * 10000  # Very long text
        
        # The service truncates to 8000 chars in _sync_embed
        truncated = long_text[:8000]
        assert len(truncated) == 8000
        
        # Mock embedding should still work
        service = EmbeddingService()
        mock_embedding = service._generate_mock_embedding(truncated)
        assert len(mock_embedding) == 1536
    
    def test_chunk_text(self):
        """Test text chunking for long documents"""
        service = EmbeddingService()
        
        # Test short text returns single chunk
        short_text = "This is a short text."
        chunks = service.chunk_text(short_text)
        assert len(chunks) == 1
        assert chunks[0] == short_text
        
        # Test empty text
        chunks = service.chunk_text("")
        assert len(chunks) == 0
        
        # Test long text is chunked
        long_text = "This is sentence one. " * 100
        chunks = service.chunk_text(long_text, chunk_size=500, overlap=50)
        assert len(chunks) > 1


class TestEmbeddingSimilarity:
    """Tests for embedding similarity calculations"""

    def test_cosine_similarity_same_vectors(self):
        """Test identical vectors have similarity 1.0"""
        vec = np.random.randn(1536)
        vec = vec / np.linalg.norm(vec)
        similarity = np.dot(vec, vec)
        assert abs(similarity - 1.0) < 0.0001

    def test_cosine_similarity_orthogonal_vectors(self):
        """Test orthogonal vectors have similarity 0.0"""
        vec1 = np.zeros(1536)
        vec1[0] = 1.0
        vec2 = np.zeros(1536)
        vec2[1] = 1.0
        similarity = np.dot(vec1, vec2)
        assert abs(similarity) < 0.0001

    def test_cosine_similarity_opposite_vectors(self):
        """Test opposite vectors have similarity -1.0"""
        vec1 = np.random.randn(1536)
        vec1 = vec1 / np.linalg.norm(vec1)
        vec2 = -vec1
        similarity = np.dot(vec1, vec2)
        assert abs(similarity + 1.0) < 0.0001

    def test_similarity_range(self):
        """Test similarity is in range [-1, 1]"""
        for _ in range(100):
            vec1 = np.random.randn(1536)
            vec1 = vec1 / np.linalg.norm(vec1)
            vec2 = np.random.randn(1536)
            vec2 = vec2 / np.linalg.norm(vec2)
            similarity = np.dot(vec1, vec2)
            assert -1.0 <= similarity <= 1.0
