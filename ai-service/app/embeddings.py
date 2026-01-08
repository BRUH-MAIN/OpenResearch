"""Embedding service using Gemini for text embeddings."""

import asyncio
import time
from typing import Optional
import numpy as np
from google import genai

from .config import get_settings


class EmbeddingService:
    """Service for generating text embeddings using Gemini."""
    
    # text-embedding-004 produces 768-dimensional vectors
    EMBEDDING_DIMENSION = 768
    
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.client: Optional[genai.Client] = None
        self._initialized = False
        
    def initialize(self) -> bool:
        """Initialize the embedding client. Returns True if successful."""
        if not self.api_key:
            print("⚠️  GEMINI_API_KEY not set - embedding service unavailable")
            return False
        try:
            self.client = genai.Client(api_key=self.api_key)
            self._initialized = True
            print("✅ Embedding service initialized")
            return True
        except Exception as e:
            print(f"❌ Failed to initialize embedding service: {e}")
            return False
    
    @property
    def is_configured(self) -> bool:
        """Check if the service is properly configured."""
        return self._initialized and self.client is not None
    
    def _sync_embed(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT"
    ) -> list[float]:
        """
        Synchronous embedding call using new Google GenAI SDK.
        """
        if not self.is_configured:
            raise RuntimeError("Embedding service not initialized")
        
        response = self.client.models.embed_content(
            model="models/text-embedding-004",
            contents=text[:8000],  # Limit text length
            config={"task_type": task_type}
        )
        
        # Get the embedding from response
        if hasattr(response, 'embeddings') and response.embeddings:
            embedding = list(response.embeddings[0].values)
            return embedding
        else:
            raise RuntimeError("No embedding in response")
    
    async def generate_embedding(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT"
    ) -> tuple[list[float], int]:
        """
        Generate embedding for text using Gemini (async wrapper).
        
        Args:
            text: Text to embed
            task_type: Type of embedding task (RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY, etc.)
            
        Returns:
            Tuple of (embedding vector, latency_ms)
        """
        start_time = time.time()
        
        try:
            # Run sync call in thread pool
            embedding = await asyncio.to_thread(
                self._sync_embed,
                text,
                task_type,
            )
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Pad or truncate to EMBEDDING_DIMENSION if needed
            if len(embedding) < self.EMBEDDING_DIMENSION:
                embedding.extend([0.0] * (self.EMBEDDING_DIMENSION - len(embedding)))
            elif len(embedding) > self.EMBEDDING_DIMENSION:
                embedding = embedding[:self.EMBEDDING_DIMENSION]
                
            return embedding, latency_ms
                
        except Exception as e:
            # Fallback to mock embedding for development/when API fails
            print(f"⚠️  Embedding generation failed: {e}, using mock embedding")
            latency_ms = int((time.time() - start_time) * 1000)
            return self._generate_mock_embedding(text), latency_ms
    
    async def generate_embeddings_batch(
        self,
        texts: list[str],
        task_type: str = "RETRIEVAL_DOCUMENT"
    ) -> tuple[list[list[float]], int]:
        """
        Generate embeddings for multiple texts.
        
        Returns:
            Tuple of (list of embedding vectors, total latency_ms)
        """
        embeddings = []
        total_latency = 0
        
        for text in texts:
            embedding, latency = await self.generate_embedding(text, task_type)
            embeddings.append(embedding)
            total_latency += latency
            
        return embeddings, total_latency
    
    def _generate_mock_embedding(self, text: str) -> list[float]:
        """Generate a deterministic mock embedding for testing."""
        # Use hash of text to generate deterministic pseudo-random embedding
        np.random.seed(hash(text) % (2**32))
        embedding = np.random.randn(self.EMBEDDING_DIMENSION).astype(float)
        # Normalize to unit length
        embedding = embedding / np.linalg.norm(embedding)
        return embedding.tolist()
    
    def chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 200
    ) -> list[str]:
        """
        Split text into overlapping chunks for embedding.
        
        Args:
            text: Text to chunk
            chunk_size: Target size of each chunk in characters
            overlap: Number of characters to overlap between chunks
            
        Returns:
            List of text chunks
        """
        if not text or len(text) <= chunk_size:
            return [text] if text else []
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            
            # Try to break at sentence boundary
            if end < len(text):
                # Look for sentence end in last 20% of chunk
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
