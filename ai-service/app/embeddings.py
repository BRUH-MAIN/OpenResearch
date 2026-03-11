"""Embedding service using sentence-transformers for local text embeddings.

Uses SPECTER2 model optimized for scientific/academic papers.
No API key required - runs locally.
"""

import asyncio
import logging
import threading
import time
from typing import Optional
import numpy as np

from .config import get_settings

logger = logging.getLogger(__name__)

# Lazy load to avoid import overhead — protected by a lock so parallel
# asyncio.to_thread calls don't each trigger their own model load.
_model = None
_tokenizer = None
_model_lock = threading.Lock()


def _load_specter2_base():
    """Load allenai/specter2_base with explicit sentence-transformers config.

    specter2_base is a plain BERT model without sentence-transformers
    metadata (modules.json / config_sentence_transformers.json), so
    SentenceTransformer() prints a noisy warning. We build the pipeline
    manually to avoid that.
    """
    from sentence_transformers import SentenceTransformer, models

    word_model = models.Transformer(
        "allenai/specter2_base",
        max_seq_length=512,
        model_args={"local_files_only": True},
        tokenizer_args={"local_files_only": True},
    )
    pooling_model = models.Pooling(
        word_model.get_word_embedding_dimension(),
        pooling_mode_mean_tokens=True,
    )
    return SentenceTransformer(modules=[word_model, pooling_model])


def _get_model():
    """Lazy load the sentence-transformer model with robust fallback chain."""
    global _model, _tokenizer
    # Fast path — no lock needed once the model is loaded
    if _model is not None:
        return _model

    with _model_lock:
        # Double-check after acquiring lock
        if _model is not None:
            return _model

        from sentence_transformers import SentenceTransformer

        # Primary: specter2_base (built manually to avoid missing-config warning)
        # Fallback: all-MiniLM-L6-v2 (has native ST config)
        try:
            logger.info("Loading embedding model: SPECTER2-base …")
            _model = _load_specter2_base()
            logger.info("✅ Embedding model loaded: SPECTER2-base")
            return _model
        except Exception as exc:
            logger.warning("Failed to load SPECTER2-base: %s", exc)

        try:
            logger.info("Loading embedding model: all-MiniLM-L6-v2 …")
            _model = SentenceTransformer(
                "sentence-transformers/all-MiniLM-L6-v2",
                local_files_only=True,
            )
            logger.info("✅ Embedding model loaded: all-MiniLM-L6-v2")
            return _model
        except Exception as exc:
            logger.warning("Failed to load all-MiniLM-L6-v2 (local): %s", exc)

        # Last resort: try downloading if not cached
        try:
            logger.info("Downloading all-MiniLM-L6-v2 …")
            _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
            logger.info("✅ Embedding model downloaded: all-MiniLM-L6-v2")
            return _model
        except Exception as exc:
            logger.warning("Failed to download all-MiniLM-L6-v2: %s", exc)

        logger.error("❌ All embedding model fallbacks failed")
    return _model


class EmbeddingService:
    """Service for generating text embeddings using local sentence-transformers.
    
    Uses SPECTER2 model which is specifically trained on scientific papers.
    No API key required - runs entirely locally.
    """
    
    # SPECTER2 produces 768-dimensional vectors
    EMBEDDING_DIMENSION = 768
    
    def __init__(self):
        self._initialized = False
        self._model = None
        
    def initialize(self) -> bool:
        """Initialize the embedding model. Returns True if successful."""
        try:
            self._model = _get_model()
            if self._model is None:
                logger.error("Embedding model is None — all fallbacks failed")
                self._initialized = False
                return False
            self._initialized = True
            logger.info("Embedding service initialized (SPECTER2 - local)")
            return True
        except Exception as e:
            logger.error("Failed to initialize embedding service: %s", e)
            return False
    
    @property
    def is_configured(self) -> bool:
        """Check if the service is properly configured."""
        return self._initialized and self._model is not None
    
    def _sync_embed(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT"
    ) -> list[float]:
        """
        Synchronous embedding using sentence-transformers.
        """
        if not self.is_configured:
            # Lazy init if not already done
            self.initialize()
            if not self.is_configured:
                raise RuntimeError("Embedding service not initialized")
        
        # Truncate text to model's max length (512 tokens typical)
        # SPECTER2 handles this internally, but we limit for efficiency
        text = text[:4096]
        
        # Generate embedding
        embedding = self._model.encode(text, convert_to_numpy=True)
        
        # Convert to list
        return embedding.tolist()
    
    async def generate_embedding(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT"
    ) -> tuple[list[float], int]:
        """
        Generate embedding for text (async wrapper).
        
        Args:
            text: Text to embed
            task_type: Type of embedding task (RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY, etc.)
            
        Returns:
            Tuple of (embedding vector, latency_ms)
        """
        start_time = time.time()
        
        try:
            # Run sync call in thread pool to not block event loop
            embedding = await asyncio.to_thread(
                self._sync_embed,
                text,
                task_type,
            )
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Ensure correct dimension
            if len(embedding) < self.EMBEDDING_DIMENSION:
                embedding.extend([0.0] * (self.EMBEDDING_DIMENSION - len(embedding)))
            elif len(embedding) > self.EMBEDDING_DIMENSION:
                embedding = embedding[:self.EMBEDDING_DIMENSION]
                
            return embedding, latency_ms
                
        except Exception as e:
            # Fallback to mock embedding for development/when model fails
            logger.warning("Embedding generation failed: %s, using mock embedding", e)
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
