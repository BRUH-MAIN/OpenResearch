"""Vector store operations for group-isolated RAG using PostgreSQL + pgvector."""

from typing import Optional
import logging
import uuid
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from .config import get_settings
from .embeddings import embedding_service
from .database import convert_db_url_for_asyncpg

logger = logging.getLogger(__name__)


class VectorStore:
    """Group-isolated vector store using PostgreSQL + pgvector."""
    
    def __init__(self):
        self.engine = None
        self.session_factory = None
        self._connected = False
    
    async def connect(self) -> bool:
        """Initialize database connection. Returns True if successful."""
        settings = get_settings()
        
        if not settings.database_url:
            print("DATABASE_URL not configured")
            return False
        
        try:
            # Convert URL and get connect_args for SSL
            db_url, connect_args = convert_db_url_for_asyncpg(settings.database_url)
            
            self.engine = create_async_engine(
                db_url,
                echo=settings.debug,
                pool_size=5,
                max_overflow=10,
                connect_args=connect_args,
            )
            
            self.session_factory = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            
            # Test connection and ensure pgvector extension
            async with self.engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            
            self._connected = True
            return True
            
        except Exception as e:
            print(f"Vector store connection failed: {e}")
            return False
    
    async def disconnect(self):
        """Close database connection."""
        if self.engine:
            await self.engine.dispose()
            self._connected = False
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    async def insert_vector(
        self,
        group_id: str,
        paper_id: str,
        content: str,
        content_type: str = "paper",
        content_id: Optional[str] = None,
        chunk_index: int = 0,
        metadata: Optional[dict] = None
    ) -> Optional[str]:
        """
        Insert a vector embedding for content.
        
        CRITICAL: All vectors are stored with groupId for isolation.
        
        Args:
            group_id: Group ID (REQUIRED for isolation)
            paper_id: Paper ID
            content: Text content to embed
            content_type: Type of content (paper, qa, summary, memory, report)
            content_id: ID of the source content
            chunk_index: Index if content is chunked
            metadata: Additional metadata
            
        Returns:
            ID of inserted vector, or None if failed
        """
        if not self.is_connected:
            raise RuntimeError("Vector store not connected")
        
        if not group_id:
            raise ValueError("groupId is REQUIRED for vector isolation")
        
        # Generate embedding
        embedding, _ = await embedding_service.generate_embedding(content)
        
        import json
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    INSERT INTO group_paper_vectors 
                    (group_id, paper_id, content_type, content_id, chunk_index, content, embedding, metadata)
                    VALUES (:group_id, :paper_id, :content_type, :content_id, :chunk_index, :content, :embedding, :metadata)
                    RETURNING id
                """),
                {
                    "group_id": group_id,
                    "paper_id": paper_id,
                    "content_type": content_type,
                    "content_id": content_id,
                    "chunk_index": chunk_index,
                    "content": content,
                    "embedding": f"[{','.join(map(str, embedding))}]",
                    "metadata": json.dumps(metadata or {})
                }
            )
            await session.commit()
            row = result.fetchone()
            return str(row.id) if row else None
    
    async def insert_paper_chunks(
        self,
        group_id: str,
        paper_id: str,
        title: str,
        abstract: str,
        full_text: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> list[str]:
        """
        Insert vector embeddings for paper content (chunked).
        
        Returns:
            List of inserted vector IDs
        """
        if not group_id:
            raise ValueError("groupId is REQUIRED for vector isolation")
        
        vector_ids = []
        
        # Always embed title + abstract together as first chunk
        title_abstract = f"{title}\n\n{abstract}"
        enriched_metadata = {**(metadata or {}), "chunk_type": "title_abstract", "title": title}
        vector_id = await self.insert_vector(
            group_id=group_id,
            paper_id=paper_id,
            content=title_abstract,
            content_type="paper",
            content_id=paper_id,
            chunk_index=0,
            metadata=enriched_metadata
        )
        if vector_id:
            vector_ids.append(vector_id)
        
        # Chunk and embed full text if available
        if full_text:
            chunks = embedding_service.chunk_text(full_text)
            for i, chunk in enumerate(chunks, start=1):
                vector_id = await self.insert_vector(
                    group_id=group_id,
                    paper_id=paper_id,
                    content=chunk,
                    content_type="paper",
                    content_id=paper_id,
                    chunk_index=i,
                    metadata={**(metadata or {}), "chunk_type": "full_text", "title": title}
                )
                if vector_id:
                    vector_ids.append(vector_id)
        
        return vector_ids
    
    async def search_group_vectors(
        self,
        group_id: str,
        query: str,
        limit: int = 10,
        content_types: Optional[list[str]] = None,
        paper_id: Optional[str] = None
    ) -> list[dict]:
        """
        Search vectors within a group's isolated namespace.
        
        CRITICAL: Always filters by groupId to prevent cross-group retrieval.
        
        Args:
            group_id: Group ID (REQUIRED)
            query: Search query
            limit: Max results to return
            content_types: Filter by content types
            paper_id: Filter by specific paper
            
        Returns:
            List of matching content with similarity scores
        """
        if not self.is_connected:
            raise RuntimeError("Vector store not connected")
        
        if not group_id:
            raise ValueError("groupId is REQUIRED for vector search")
        try:
            uuid.UUID(group_id)
        except (ValueError, AttributeError, TypeError) as exc:
            raise ValueError("group_id must be a valid UUID.") from exc
        
        # Generate query embedding
        query_embedding, _ = await embedding_service.generate_embedding(
            query, task_type="RETRIEVAL_QUERY"
        )
        
        # Build base query parameters
        params = {
            "group_id": group_id,
            "query_embedding": f"[{','.join(map(str, query_embedding))}]",
            "limit": limit,
        }
        
        # Build WHERE clauses with proper parameterization
        where_clauses = ["v.group_id = :group_id"]
        
        # Handle content_types filter - validate allowed values to prevent SQL injection
        ALLOWED_CONTENT_TYPES = {"paper", "qa", "summary", "memory", "report", "chat_response"}
        if content_types:
            # Filter to only allowed content types
            valid_types = [t for t in content_types if t in ALLOWED_CONTENT_TYPES]
            if valid_types:
                # Use ANY with array for safe parameterization
                params["content_types"] = valid_types
                where_clauses.append("v.content_type = ANY(:content_types)")
        
        if paper_id:
            params["paper_id"] = paper_id
            where_clauses.append("v.paper_id = :paper_id")
        
        where_sql = " AND ".join(where_clauses)
        
        async with self.session_factory() as session:
            result = await session.execute(
                text(f"""
                    SELECT 
                        v.id,
                        v.group_id,
                        v.paper_id,
                        v.content_type,
                        v.content_id,
                        v.chunk_index,
                        v.content,
                        v.metadata,
                        v.embedding <=> :query_embedding AS distance,
                        p.title AS paper_title,
                        p.url AS paper_url
                    FROM group_paper_vectors v
                    LEFT JOIN papers p ON v.paper_id::text = p.id::text
                    WHERE {where_sql}
                    ORDER BY v.embedding <=> :query_embedding
                    LIMIT :limit
                """),
                params
            )
            
            rows = result.fetchall()
            return [
                {
                    "id": str(row.id),
                    "group_id": str(row.group_id),
                    "paper_id": row.paper_id,
                    "content_type": row.content_type,
                    "content_id": row.content_id,
                    "chunk_index": row.chunk_index,
                    "content": row.content,
                    "metadata": row.metadata,
                    "title": row.paper_title or "",
                    "url": row.paper_url or "",
                    "similarity": 1 - float(row.distance)  # Convert distance to similarity
                }
                for row in rows
            ]
    
    async def hybrid_search_group_vectors(
        self,
        group_id: str,
        query: str,
        limit: int = 10,
        content_types: Optional[list[str]] = None,
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4,
        rrf_k: int = 60,
    ) -> list[dict]:
        """
        Hybrid search combining vector cosine similarity + BM25 full-text search.

        Uses Reciprocal Rank Fusion (RRF) to merge rankings:
            score = vector_weight / (rrf_k + vector_rank) + bm25_weight / (rrf_k + bm25_rank)

        Falls back to vector-only search if tsvector column is unavailable.

        Args:
            group_id: Group ID (REQUIRED)
            query: Search query
            limit: Max results to return
            content_types: Filter by content types
            vector_weight: Weight for vector similarity in RRF (default 0.6)
            bm25_weight: Weight for BM25 score in RRF (default 0.4)
            rrf_k: RRF constant (default 60, standard value)

        Returns:
            List of matching content with hybrid scores
        """
        if not self.is_connected:
            raise RuntimeError("Vector store not connected")

        if not group_id:
            raise ValueError("groupId is REQUIRED for vector search")
        try:
            uuid.UUID(group_id)
        except (ValueError, AttributeError, TypeError) as exc:
            raise ValueError("group_id must be a valid UUID.") from exc

        # Generate query embedding
        query_embedding, _ = await embedding_service.generate_embedding(
            query, task_type="RETRIEVAL_QUERY"
        )

        # Build WHERE clauses
        params = {
            "group_id": group_id,
            "query_embedding": f"[{','.join(map(str, query_embedding))}]",
            "limit": limit,
            "ts_query": query,
        }

        where_clauses = ["group_id = :group_id"]

        ALLOWED_CONTENT_TYPES = {"paper", "qa", "summary", "memory", "report", "chat_response"}
        if content_types:
            valid_types = [t for t in content_types if t in ALLOWED_CONTENT_TYPES]
            if valid_types:
                params["content_types"] = valid_types
                where_clauses.append("content_type = ANY(:content_types)")

        where_sql = " AND ".join(where_clauses)

        # Hybrid query using RRF: combine vector rank and BM25 rank
        # LEFT JOIN papers to enrich results with human-readable title & URL
        hybrid_sql = f"""
            WITH vector_results AS (
                SELECT
                    id, group_id, paper_id, content_type, content_id,
                    chunk_index, content, metadata,
                    embedding <=> :query_embedding AS vector_distance,
                    ROW_NUMBER() OVER (ORDER BY embedding <=> :query_embedding) AS vector_rank
                FROM group_paper_vectors
                WHERE {where_sql}
                ORDER BY embedding <=> :query_embedding
                LIMIT :limit * 3
            ),
            bm25_results AS (
                SELECT
                    id,
                    ts_rank_cd(content_tsv, plainto_tsquery('english', :ts_query)) AS bm25_score,
                    ROW_NUMBER() OVER (
                        ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', :ts_query)) DESC
                    ) AS bm25_rank
                FROM group_paper_vectors
                WHERE {where_sql}
                    AND content_tsv @@ plainto_tsquery('english', :ts_query)
                LIMIT :limit * 3
            )
            SELECT
                v.id, v.group_id, v.paper_id, v.content_type, v.content_id,
                v.chunk_index, v.content, v.metadata,
                v.vector_distance,
                v.vector_rank,
                COALESCE(b.bm25_score, 0) AS bm25_score,
                COALESCE(b.bm25_rank, :limit * 3 + 1) AS bm25_rank,
                (
                    {vector_weight} / ({rrf_k} + v.vector_rank)
                    + {bm25_weight} / ({rrf_k} + COALESCE(b.bm25_rank, :limit * 3 + 1))
                ) AS rrf_score,
                p.title AS paper_title,
                p.url AS paper_url
            FROM vector_results v
            LEFT JOIN bm25_results b ON v.id = b.id
            LEFT JOIN papers p ON v.paper_id::text = p.id::text
            ORDER BY rrf_score DESC
            LIMIT :limit
        """

        try:
            async with self.session_factory() as session:
                result = await session.execute(text(hybrid_sql), params)
                rows = result.fetchall()

                return [
                    {
                        "id": str(row.id),
                        "group_id": str(row.group_id),
                        "paper_id": row.paper_id,
                        "content_type": row.content_type,
                        "content_id": row.content_id,
                        "chunk_index": row.chunk_index,
                        "content": row.content,
                        "metadata": row.metadata,
                        "title": row.paper_title or "",
                        "url": row.paper_url or "",
                        "similarity": 1 - float(row.vector_distance),
                        "bm25_score": float(row.bm25_score),
                        "rrf_score": float(row.rrf_score),
                    }
                    for row in rows
                ]

        except Exception as exc:
            # Fallback to vector-only if tsvector column doesn't exist yet
            logger.warning("Hybrid search failed (%s), falling back to vector-only", exc)
            return await self.search_group_vectors(
                group_id=group_id, query=query, limit=limit,
                content_types=content_types,
            )
    
    async def delete_paper_vectors(
        self,
        group_id: str,
        paper_id: str
    ) -> int:
        """
        Delete all vectors for a paper within a group.
        
        Returns:
            Number of deleted vectors
        """
        if not group_id:
            raise ValueError("groupId is REQUIRED for vector deletion")
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    DELETE FROM group_paper_vectors
                    WHERE group_id = :group_id AND paper_id = :paper_id
                    RETURNING id
                """),
                {"group_id": group_id, "paper_id": paper_id}
            )
            await session.commit()
            return len(result.fetchall())
    
    async def get_group_vector_stats(self, group_id: str) -> dict:
        """Get statistics about vectors in a group's namespace."""
        if not group_id:
            raise ValueError("groupId is REQUIRED")
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT 
                        content_type,
                        COUNT(*) as count
                    FROM group_paper_vectors
                    WHERE group_id = :group_id
                    GROUP BY content_type
                """),
                {"group_id": group_id}
            )
            
            rows = result.fetchall()
            stats = {row.content_type: row.count for row in rows}
            stats["total"] = sum(stats.values())
            return stats


# Singleton instance
vector_store = VectorStore()
