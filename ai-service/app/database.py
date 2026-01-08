"""Database connection for reading context from the main OpenResearch database."""

from typing import Optional
from urllib.parse import urlparse, parse_qs, urlencode
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
import ssl

from .config import get_settings


def convert_db_url_for_asyncpg(db_url: str) -> tuple[str, dict]:
    """
    Convert a PostgreSQL URL to asyncpg format, handling SSL parameters.
    
    Returns:
        Tuple of (cleaned_url, connect_args)
    """
    # Parse the URL
    parsed = urlparse(db_url)
    
    # Extract query parameters
    query_params = parse_qs(parsed.query)
    
    # Check for SSL requirements
    ssl_mode = query_params.pop('sslmode', [None])[0]
    query_params.pop('channel_binding', None)  # Remove channel_binding (not supported by asyncpg)
    
    # Build connect_args for SSL
    connect_args = {}
    if ssl_mode in ('require', 'verify-ca', 'verify-full'):
        # Create SSL context for asyncpg
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        connect_args['ssl'] = ssl_context
    
    # Rebuild the URL without incompatible params
    new_query = urlencode({k: v[0] if len(v) == 1 else v for k, v in query_params.items()}, doseq=True)
    
    # Convert to asyncpg scheme
    scheme = parsed.scheme
    if scheme == "postgresql":
        scheme = "postgresql+asyncpg"
    elif scheme == "postgres":
        scheme = "postgresql+asyncpg"
    
    # Rebuild URL
    if new_query:
        new_url = f"{scheme}://{parsed.netloc}{parsed.path}?{new_query}"
    else:
        new_url = f"{scheme}://{parsed.netloc}{parsed.path}"
    
    return new_url, connect_args


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
    
    # ============ Group Context Methods ============
    
    async def get_group_info(self, group_id: str) -> Optional[dict]:
        """Get group information."""
        if not self.is_connected:
            return None
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT g.id, g.name, g.description, g.owner_id, u.name as owner_name
                    FROM groups g
                    JOIN users u ON g.owner_id = u.id
                    WHERE g.id = :group_id
                """),
                {"group_id": group_id}
            )
            
            row = result.fetchone()
            if row:
                return {
                    "id": str(row.id),
                    "name": row.name,
                    "description": row.description,
                    "owner_id": str(row.owner_id),
                    "owner_name": row.owner_name,
                }
            return None
    
    async def get_user_info(self, user_id: str) -> Optional[dict]:
        """Get user information."""
        if not self.is_connected:
            return None
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("SELECT id, name, email FROM users WHERE id = :user_id"),
                {"user_id": user_id}
            )
            
            row = result.fetchone()
            if row:
                return {"id": str(row.id), "name": row.name, "email": row.email}
            return None
    
    async def get_paper_info(self, paper_id: str) -> Optional[dict]:
        """Get paper information."""
        if not self.is_connected:
            return None
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("SELECT * FROM papers WHERE id = :paper_id"),
                {"paper_id": paper_id}
            )
            
            row = result.fetchone()
            if row:
                return {
                    "id": str(row.id),
                    "title": row.title,
                    "authors": row.authors if row.authors else [],
                    "abstract": row.abstract,
                    "tags": row.tags if row.tags else [],
                    "url": row.url,
                    "published_date": row.published_date,
                }
            return None
    
    async def get_group_memory_notes(self, group_id: str, limit: int = 20) -> list[dict]:
        """Get group memory notes."""
        if not self.is_connected:
            return []
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT id, content, note_type, metadata, created_at
                    FROM group_memory_notes
                    WHERE group_id = :group_id
                    ORDER BY created_at DESC
                    LIMIT :limit
                """),
                {"group_id": group_id, "limit": limit}
            )
            
            rows = result.fetchall()
            return [
                {
                    "id": str(row.id),
                    "content": row.content,
                    "note_type": row.note_type,
                    "metadata": row.metadata,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row in rows
            ]
    
    async def get_group_papers(self, group_id: str) -> list[dict]:
        """Get papers in a group."""
        if not self.is_connected:
            return []
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT 
                        p.id, p.title, p.authors, p.abstract, p.tags, p.url, p.published_date,
                        gp.notes, gp.created_at as added_at
                    FROM group_papers gp
                    JOIN papers p ON gp.paper_id = p.id
                    WHERE gp.group_id = :group_id
                    ORDER BY gp.created_at DESC
                """),
                {"group_id": group_id}
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
                    "published_date": row.published_date,
                    "notes": row.notes,
                    "added_at": row.added_at.isoformat() if row.added_at else None,
                }
                for row in rows
            ]
    
    async def get_group_sessions_with_messages(self, group_id: str) -> list[dict]:
        """Get group sessions with recent messages."""
        if not self.is_connected:
            return []
        
        async with self.session_factory() as session:
            # Get sessions
            result = await session.execute(
                text("""
                    SELECT id, title, status, created_at, last_activity_at
                    FROM sessions
                    WHERE group_id = :group_id
                    ORDER BY last_activity_at DESC
                """),
                {"group_id": group_id}
            )
            
            sessions = []
            for row in result.fetchall():
                session_data = {
                    "id": str(row.id),
                    "title": row.title,
                    "status": row.status,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                    "messages": []
                }
                
                # Get messages for session
                msg_result = await session.execute(
                    text("""
                        SELECT m.content, m.type, m.created_at, u.name as user_name
                        FROM messages m
                        LEFT JOIN users u ON m.user_id = u.id
                        WHERE m.session_id = :session_id
                        ORDER BY m.created_at DESC
                        LIMIT 20
                    """),
                    {"session_id": row.id}
                )
                
                session_data["messages"] = [
                    {
                        "content": msg.content,
                        "type": msg.type,
                        "user_name": msg.user_name or "AI",
                        "created_at": msg.created_at.isoformat() if msg.created_at else None,
                    }
                    for msg in reversed(msg_result.fetchall())
                ]
                
                sessions.append(session_data)
            
            return sessions
    
    async def get_group_artifacts(self, group_id: str) -> list[dict]:
        """Get AI artifacts for a group."""
        if not self.is_connected:
            return []
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT id, artifact_type, prompt, content, metadata, created_at
                    FROM ai_artifacts
                    WHERE group_id = :group_id
                    ORDER BY created_at DESC
                """),
                {"group_id": group_id}
            )
            
            rows = result.fetchall()
            return [
                {
                    "id": str(row.id),
                    "artifact_type": row.artifact_type,
                    "prompt": row.prompt,
                    "content": row.content,
                    "metadata": row.metadata,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row in rows
            ]
    
    async def store_ai_artifact(
        self,
        group_id: str,
        artifact_type: str,
        content: str,
        prompt: Optional[str] = None,
        session_id: Optional[str] = None,
        paper_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> Optional[str]:
        """Store an AI artifact."""
        import json
        if not self.is_connected:
            return None
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    INSERT INTO ai_artifacts 
                    (group_id, session_id, paper_id, user_id, artifact_type, prompt, content, metadata)
                    VALUES (:group_id, :session_id, :paper_id, :user_id, :artifact_type, :prompt, :content, :metadata)
                    RETURNING id
                """),
                {
                    "group_id": group_id,
                    "session_id": session_id,
                    "paper_id": paper_id,
                    "user_id": user_id,
                    "artifact_type": artifact_type,
                    "prompt": prompt,
                    "content": content,
                    "metadata": json.dumps(metadata or {})
                }
            )
            await session.commit()
            row = result.fetchone()
            return str(row.id) if row else None
    
    async def store_report_metadata(
        self,
        group_id: str,
        generated_by: str,
        title: str,
        file_path: str,
        file_size: int,
        include_sessions: bool = True,
        include_papers: bool = True,
        include_summaries: bool = True
    ) -> Optional[str]:
        """Store report metadata."""
        if not self.is_connected:
            return None
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    INSERT INTO group_reports 
                    (group_id, created_by, title, status, file_path, file_size, include_sessions, include_papers, include_summaries)
                    VALUES (:group_id, :created_by, :title, 'completed', :file_path, :file_size, :include_sessions, :include_papers, :include_summaries)
                    RETURNING id
                """),
                {
                    "group_id": group_id,
                    "created_by": generated_by,
                    "title": title,
                    "file_path": file_path,
                    "file_size": file_size,
                    "include_sessions": include_sessions,
                    "include_papers": include_papers,
                    "include_summaries": include_summaries
                }
            )
            await session.commit()
            row = result.fetchone()
            return str(row.id) if row else None
    
    async def add_group_paper(
        self,
        group_id: str,
        paper_id: str,
        added_by: str,
        notes: Optional[str] = None,
        full_text: Optional[str] = None
    ) -> Optional[str]:
        """Add a paper to a group."""
        if not self.is_connected:
            return None
        
        async with self.session_factory() as session:
            result = await session.execute(
                text("""
                    INSERT INTO group_papers (group_id, paper_id, added_by, notes, full_text)
                    VALUES (:group_id, :paper_id, :added_by, :notes, :full_text)
                    ON CONFLICT (group_id, paper_id) DO UPDATE SET notes = :notes
                    RETURNING id
                """),
                {
                    "group_id": group_id,
                    "paper_id": paper_id,
                    "added_by": added_by,
                    "notes": notes,
                    "full_text": full_text
                }
            )
            await session.commit()
            row = result.fetchone()
            return str(row.id) if row else None


# Singleton instance
database = Database()
