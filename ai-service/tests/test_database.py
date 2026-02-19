"""Tests for the database module."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from datetime import datetime

from app.database import Database, convert_db_url_for_asyncpg


# ---------------------------------------------------------------------------
# URL Conversion Tests
# ---------------------------------------------------------------------------

class TestConvertDbUrl:

    def test_postgresql_to_asyncpg(self):
        url, args = convert_db_url_for_asyncpg(
            "postgresql://user:pass@localhost:5432/db"
        )
        assert url.startswith("postgresql+asyncpg://")
        assert "user:pass@localhost:5432/db" in url
        assert args == {}

    def test_postgres_to_asyncpg(self):
        url, args = convert_db_url_for_asyncpg(
            "postgres://user:pass@localhost:5432/db"
        )
        assert url.startswith("postgresql+asyncpg://")

    def test_ssl_require(self):
        url, args = convert_db_url_for_asyncpg(
            "postgresql://user:pass@host/db?sslmode=require"
        )
        assert "ssl" in args
        assert "sslmode" not in url

    def test_channel_binding_removed(self):
        url, args = convert_db_url_for_asyncpg(
            "postgresql://user:pass@host/db?channel_binding=prefer"
        )
        assert "channel_binding" not in url

    def test_preserves_other_params(self):
        url, args = convert_db_url_for_asyncpg(
            "postgresql://user:pass@host/db?application_name=test"
        )
        assert "application_name=test" in url

    def test_no_query_params(self):
        url, args = convert_db_url_for_asyncpg(
            "postgresql://user:pass@host/db"
        )
        assert "?" not in url


# ---------------------------------------------------------------------------
# Database Initialization Tests
# ---------------------------------------------------------------------------

class TestDatabaseInit:

    def test_initial_state(self):
        db = Database()
        assert db.engine is None
        assert db.session_factory is None
        assert db.is_connected is False

    @pytest.mark.asyncio
    @patch("app.database.get_settings")
    async def test_connect_no_url(self, mock_settings):
        settings = MagicMock()
        settings.database_url = ""
        mock_settings.return_value = settings

        db = Database()
        result = await db.connect()
        assert result is False
        assert db.is_connected is False

    @pytest.mark.asyncio
    async def test_disconnect(self):
        db = Database()
        db.engine = AsyncMock()
        db._connected = True

        await db.disconnect()
        assert db.is_connected is False
        db.engine.dispose.assert_awaited_once()


# ---------------------------------------------------------------------------
# Query Methods — Disconnected State (early return)
# ---------------------------------------------------------------------------

class TestDisconnectedQueries:
    """All query methods should gracefully return empty when not connected."""

    @pytest.fixture
    def db(self):
        return Database()

    @pytest.mark.asyncio
    async def test_get_session_messages_disconnected(self, db):
        result = await db.get_session_messages("session-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_session_info_disconnected(self, db):
        result = await db.get_session_info("session-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_session_papers_disconnected(self, db):
        result = await db.get_session_papers("session-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_group_info_disconnected(self, db):
        result = await db.get_group_info("group-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_user_info_disconnected(self, db):
        result = await db.get_user_info("user-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_paper_info_disconnected(self, db):
        result = await db.get_paper_info("paper-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_group_memory_notes_disconnected(self, db):
        result = await db.get_group_memory_notes("group-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_group_papers_disconnected(self, db):
        result = await db.get_group_papers("group-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_group_sessions_with_messages_disconnected(self, db):
        result = await db.get_group_sessions_with_messages("group-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_group_artifacts_disconnected(self, db):
        result = await db.get_group_artifacts("group-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_store_ai_artifact_disconnected(self, db):
        result = await db.store_ai_artifact("g1", "qa", "content")
        assert result is None

    @pytest.mark.asyncio
    async def test_store_report_metadata_disconnected(self, db):
        result = await db.store_report_metadata("g1", "user", "title", "/path", 100)
        assert result is None

    @pytest.mark.asyncio
    async def test_add_group_paper_disconnected(self, db):
        result = await db.add_group_paper("g1", "p1", "user1")
        assert result is None


# ---------------------------------------------------------------------------
# Query Methods — Connected State (mock session)
# ---------------------------------------------------------------------------

class TestConnectedQueries:
    """Test query methods with mocked SQLAlchemy session."""

    @pytest.fixture
    def db(self):
        d = Database()
        d._connected = True
        # Build a mock session context manager
        mock_session = AsyncMock()
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)
        d.session_factory = mock_session_factory
        d._mock_session = mock_session
        return d

    def _make_row(self, **kwargs):
        """Build a mock row with attribute access."""
        row = MagicMock()
        for k, v in kwargs.items():
            setattr(row, k, v)
        return row

    @pytest.mark.asyncio
    async def test_get_session_messages(self, db):
        now = datetime(2026, 1, 1)
        row = self._make_row(id="m1", content="hello", type="user", created_at=now, user_id="u1", user_name="Alice")
        db._mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[row]))

        result = await db.get_session_messages("s1")
        assert len(result) == 1
        assert result[0]["content"] == "hello"
        assert result[0]["user_name"] == "Alice"

    @pytest.mark.asyncio
    async def test_get_session_info_found(self, db):
        row = self._make_row(id="s1", title="Session", group_id="g1", group_name="Group")
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))

        result = await db.get_session_info("s1")
        assert result["title"] == "Session"

    @pytest.mark.asyncio
    async def test_get_session_info_not_found(self, db):
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=None))
        result = await db.get_session_info("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_session_papers(self, db):
        row = self._make_row(
            id="p1", title="Paper", authors=["Alice"], abstract="abs",
            tags=["ML"], url="http://url"
        )
        db._mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[row]))

        result = await db.get_session_papers("s1")
        assert len(result) == 1
        assert result[0]["title"] == "Paper"

    @pytest.mark.asyncio
    async def test_get_group_info(self, db):
        row = self._make_row(id="g1", name="Group", description="desc", owner_id="u1", owner_name="Bob")
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))

        result = await db.get_group_info("g1")
        assert result["name"] == "Group"

    @pytest.mark.asyncio
    async def test_get_user_info(self, db):
        row = self._make_row(id="u1", name="Alice", email="a@b.c")
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))

        result = await db.get_user_info("u1")
        assert result["email"] == "a@b.c"

    @pytest.mark.asyncio
    async def test_get_paper_info(self, db):
        row = self._make_row(
            id="p1", title="Paper", authors=None, abstract="abs",
            tags=None, url="http://url", published_date="2026-01-01"
        )
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))

        result = await db.get_paper_info("p1")
        assert result["authors"] == []
        assert result["tags"] == []

    @pytest.mark.asyncio
    async def test_get_group_memory_notes(self, db):
        now = datetime(2026, 1, 1)
        row = self._make_row(id="n1", content="note", note_type="insight", metadata={}, created_at=now)
        db._mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[row]))

        result = await db.get_group_memory_notes("g1")
        assert len(result) == 1
        assert result[0]["note_type"] == "insight"

    @pytest.mark.asyncio
    async def test_get_group_papers(self, db):
        now = datetime(2026, 1, 1)
        row = self._make_row(
            id="p1", title="Paper", authors=[], abstract="abs",
            tags=[], url="url", published_date="2026", notes="note", added_at=now
        )
        db._mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[row]))

        result = await db.get_group_papers("g1")
        assert len(result) == 1
        assert result[0]["notes"] == "note"

    @pytest.mark.asyncio
    async def test_get_group_sessions_with_messages(self, db):
        now = datetime(2026, 1, 1)
        session_row = self._make_row(id="s1", title="Session", status="active", created_at=now, last_activity_at=now)
        msg_row = self._make_row(content="hi", type="user", user_name="Alice", created_at=now)

        session_result = MagicMock(fetchall=MagicMock(return_value=[session_row]))
        msg_result = MagicMock(fetchall=MagicMock(return_value=[msg_row]))
        db._mock_session.execute = AsyncMock(side_effect=[session_result, msg_result])

        result = await db.get_group_sessions_with_messages("g1")
        assert len(result) == 1
        assert len(result[0]["messages"]) == 1

    @pytest.mark.asyncio
    async def test_get_group_artifacts(self, db):
        now = datetime(2026, 1, 1)
        row = self._make_row(
            id="a1", artifact_type="qa", prompt="Q", content="A", metadata={}, created_at=now
        )
        db._mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[row]))

        result = await db.get_group_artifacts("g1")
        assert len(result) == 1
        assert result[0]["artifact_type"] == "qa"

    @pytest.mark.asyncio
    async def test_store_ai_artifact(self, db):
        row = self._make_row(id="new-id")
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))

        result = await db.store_ai_artifact("g1", "qa", "response", prompt="question")
        assert result == "new-id"

    @pytest.mark.asyncio
    async def test_store_report_metadata(self, db):
        row = self._make_row(id="rpt-id")
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))

        result = await db.store_report_metadata("g1", "user1", "Report", "/path.pdf", 1000)
        assert result == "rpt-id"

    @pytest.mark.asyncio
    async def test_add_group_paper(self, db):
        row = self._make_row(id="gp-id")
        db._mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))

        result = await db.add_group_paper("g1", "p1", "user1", notes="test note")
        assert result == "gp-id"
