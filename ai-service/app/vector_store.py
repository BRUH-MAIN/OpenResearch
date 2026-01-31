"""Vector store operations for group-isolated RAG using PostgreSQL + pgvector."""

from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from .config import get_settings
from .embeddings import embedding_service
from .database import convert_db_url_for_asyncpg


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
        vector_id = await self.insert_vector(
            group_id=group_id,
            paper_id=paper_id,
            content=title_abstract,
            content_type="paper",
            content_id=paper_id,
            chunk_index=0,
            metadata={**(metadata or {}), "chunk_type": "title_abstract"}
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
                    metadata={**(metadata or {}), "chunk_type": "full_text"}
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
        where_clauses = ["group_id = :group_id"]
        
        # Handle content_types filter - validate allowed values to prevent SQL injection
        ALLOWED_CONTENT_TYPES = {"paper", "qa", "summary", "memory", "report", "chat_response"}
        if content_types:
            # Filter to only allowed content types
            valid_types = [t for t in content_types if t in ALLOWED_CONTENT_TYPES]
            if valid_types:
                # Use ANY with array for safe parameterization
                params["content_types"] = valid_types
                where_clauses.append("content_type = ANY(:content_types)")
        
        if paper_id:
            params["paper_id"] = paper_id
            where_clauses.append("paper_id = :paper_id")
        
        where_sql = " AND ".join(where_clauses)
        
        async with self.session_factory() as session:
            result = await session.execute(
                text(f"""
                    SELECT 
                        id,
                        group_id,
                        paper_id,
                        content_type,
                        content_id,
                        chunk_index,
                        content,
                        metadata,
                        embedding <=> :query_embedding AS distance
                    FROM group_paper_vectors
                    WHERE {where_sql}
                    ORDER BY embedding <=> :query_embedding
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
                    "similarity": 1 - float(row.distance)  # Convert distance to similarity
                }
                for row in rows
            ]
    
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
