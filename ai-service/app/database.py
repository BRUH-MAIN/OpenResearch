"""Database connection for reading context from the main OpenResearch database."""

from typing import Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text

from .config import get_settings


class Database:
    """Async database connection for reading session/message context."""
    
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
            # Convert postgresql:// to postgresql+asyncpg://
            db_url = settings.database_url
            if db_url.startswith("postgresql://"):
                db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            elif db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
            
            self.engine = create_async_engine(
                db_url,
                echo=settings.debug,
                pool_size=5,
                max_overflow=10,
            )
            
            self.session_factory = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            
            # Test connection
            async with self.engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            
            self._connected = True
            return True
            
        except Exception as e:
            print(f"Database connection failed: {e}")
            return False
    
    async def disconnect(self):
        """Close database connection."""
        if self.engine:
            await self.engine.dispose()
            self._connected = False
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    async def get_session_messages(
        self,
        session_id: str,
        limit: int = 50,
    ) -> list[dict]:
        """Fetch recent messages for a session."""
        if not self.is_connected:
            return []
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT 
                        m.id,
                        m.content,
                        m.type,
                        m.created_at,
                        u.id as user_id,
                        u.name as user_name
                    FROM messages m
                    LEFT JOIN users u ON m.user_id = u.id
                    WHERE m.session_id = :session_id
                    ORDER BY m.created_at DESC
                    LIMIT :limit
                """),
                {"session_id": session_id, "limit": limit}
            )
            
            rows = result.fetchall()
            return [
                {
                    "id": str(row.id),
                    "content": row.content,
                    "type": row.type,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                    "user_id": str(row.user_id) if row.user_id else None,
                    "user_name": row.user_name,
                }
                for row in reversed(rows)  # Chronological order
            ]
    
    async def get_session_info(self, session_id: str) -> Optional[dict]:
        """Get session title and group info."""
        if not self.is_connected:
            return None
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT s.id, s.title, s.group_id, g.name as group_name
                    FROM sessions s
                    JOIN groups g ON s.group_id = g.id
                    WHERE s.id = :session_id
                """),
                {"session_id": session_id}
            )
            
            row = result.fetchone()
            if row:
                return {
                    "id": str(row.id),
                    "title": row.title,
                    "group_id": str(row.group_id),
                    "group_name": row.group_name,
                }
            return None
    
    async def get_session_papers(self, session_id: str) -> list[dict]:
        """Get papers linked to a session."""
        if not self.is_connected:
            return []
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT 
                        p.id,
                        p.title,
                        p.authors,
                        p.abstract,
                        p.tags,
                        p.url
                    FROM saved_papers sp
                    JOIN papers p ON sp.paper_id = p.id
                    WHERE sp.session_id = :session_id
                """),
                {"session_id": session_id}
            )
            
            rows = result.fetchall()
            return [
                {
                    "id": str(row.id),
                    "title": row.title,
                    "authors": row.authors if row.authors else [],
                    "abstract": row.abstract,
                    "tags": row.tags if row.tags else [],
                    "url": row.url,
                }
                for row in rows
            ]


# Singleton instance
database = Database()
