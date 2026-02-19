"""
Tests for the Vector Store — actual VectorStore class methods.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

class TestVectorStoreInit:

    def test_initial_state(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        assert vs.engine is None
        assert vs.session_factory is None
        assert vs.is_connected is False

    @pytest.mark.asyncio
    @patch("app.vector_store.get_settings")
    async def test_connect_no_url(self, mock_settings):
        from app.vector_store import VectorStore
        settings = MagicMock()
        settings.database_url = ""
        mock_settings.return_value = settings

        vs = VectorStore()
        result = await vs.connect()
        assert result is False

    @pytest.mark.asyncio
    async def test_disconnect(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs.engine = AsyncMock()
        vs._connected = True

        await vs.disconnect()
        assert vs.is_connected is False
        vs.engine.dispose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_disconnect_no_engine(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        await vs.disconnect()  # should not raise


# ---------------------------------------------------------------------------
# insert_vector
# ---------------------------------------------------------------------------

class TestInsertVector:

    @pytest.fixture
    def vs(self):
        from app.vector_store import VectorStore
        v = VectorStore()
        v._connected = True
        mock_session = AsyncMock()
        row = MagicMock(id="vec-1")
        mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)
        v.session_factory = mock_session_factory
        v._mock_session = mock_session
        return v

    @pytest.mark.asyncio
    async def test_insert_vector_not_connected(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        with pytest.raises(RuntimeError, match="not connected"):
            await vs.insert_vector("g1", "p1", "content")

    @pytest.mark.asyncio
    async def test_insert_vector_no_group_id(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True
        with pytest.raises(ValueError, match="REQUIRED"):
            await vs.insert_vector("", "p1", "content")

    @pytest.mark.asyncio
    @patch("app.vector_store.embedding_service")
    async def test_insert_vector_success(self, mock_emb, vs):
        mock_emb.generate_embedding = AsyncMock(return_value=([0.1] * 768, 10))
        result = await vs.insert_vector("g1", "p1", "content")
        assert result == "vec-1"
        vs._mock_session.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# insert_paper_chunks
# ---------------------------------------------------------------------------

class TestInsertPaperChunks:

    @pytest.mark.asyncio
    async def test_insert_paper_chunks_no_group_id(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        with pytest.raises(ValueError, match="REQUIRED"):
            await vs.insert_paper_chunks("", "p1", "Title", "Abstract")

    @pytest.mark.asyncio
    @patch("app.vector_store.embedding_service")
    async def test_insert_paper_chunks_title_abstract_only(self, mock_emb):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True

        mock_session = AsyncMock()
        row = MagicMock(id="v1")
        mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))
        mock_sf = MagicMock()
        mock_sf.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_sf.return_value.__aexit__ = AsyncMock(return_value=None)
        vs.session_factory = mock_sf

        mock_emb.generate_embedding = AsyncMock(return_value=([0.1] * 768, 10))

        result = await vs.insert_paper_chunks("g1", "p1", "My Title", "Abstract text")
        assert len(result) == 1
        assert result[0] == "v1"

    @pytest.mark.asyncio
    @patch("app.vector_store.embedding_service")
    async def test_insert_paper_chunks_with_full_text(self, mock_emb):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True

        mock_session = AsyncMock()
        row = MagicMock(id="v1")
        mock_session.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))
        mock_sf = MagicMock()
        mock_sf.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_sf.return_value.__aexit__ = AsyncMock(return_value=None)
        vs.session_factory = mock_sf

        mock_emb.generate_embedding = AsyncMock(return_value=([0.1] * 768, 10))
        mock_emb.chunk_text.return_value = ["chunk1", "chunk2"]

        result = await vs.insert_paper_chunks("g1", "p1", "Title", "Abstract", full_text="long text")
        # title_abstract + 2 chunks = 3 vectors
        assert len(result) == 3


# ---------------------------------------------------------------------------
# search_group_vectors
# ---------------------------------------------------------------------------

class TestSearchGroupVectors:

    @pytest.mark.asyncio
    async def test_search_not_connected(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        with pytest.raises(RuntimeError, match="not connected"):
            await vs.search_group_vectors("g1", "query")

    @pytest.mark.asyncio
    async def test_search_no_group_id(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True
        with pytest.raises(ValueError, match="REQUIRED"):
            await vs.search_group_vectors("", "query")

    @pytest.mark.asyncio
    async def test_search_invalid_uuid(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True
        with pytest.raises(ValueError, match="valid UUID"):
            await vs.search_group_vectors("not-a-uuid", "query")

    @pytest.mark.asyncio
    @patch("app.vector_store.embedding_service")
    async def test_search_success(self, mock_emb):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True

        mock_emb.generate_embedding = AsyncMock(return_value=([0.1] * 768, 10))

        row = MagicMock(
            id="v1", group_id="g1", paper_id="p1",
            content_type="paper", content_id="c1",
            chunk_index=0, content="text", metadata={},
            distance=0.2,
        )
        mock_session = AsyncMock()
        mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[row]))
        mock_sf = MagicMock()
        mock_sf.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_sf.return_value.__aexit__ = AsyncMock(return_value=None)
        vs.session_factory = mock_sf

        gid = "11111111-1111-1111-1111-111111111111"
        results = await vs.search_group_vectors(gid, "query")
        assert len(results) == 1
        assert results[0]["similarity"] == pytest.approx(0.8)

    @pytest.mark.asyncio
    @patch("app.vector_store.embedding_service")
    async def test_search_with_content_type_filter(self, mock_emb):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True
        mock_emb.generate_embedding = AsyncMock(return_value=([0.1] * 768, 10))

        mock_session = AsyncMock()
        mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[]))
        mock_sf = MagicMock()
        mock_sf.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_sf.return_value.__aexit__ = AsyncMock(return_value=None)
        vs.session_factory = mock_sf

        gid = "11111111-1111-1111-1111-111111111111"
        results = await vs.search_group_vectors(gid, "query", content_types=["paper", "qa"])
        assert results == []

    @pytest.mark.asyncio
    @patch("app.vector_store.embedding_service")
    async def test_search_filters_invalid_content_types(self, mock_emb):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True
        mock_emb.generate_embedding = AsyncMock(return_value=([0.1] * 768, 10))

        mock_session = AsyncMock()
        mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[]))
        mock_sf = MagicMock()
        mock_sf.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_sf.return_value.__aexit__ = AsyncMock(return_value=None)
        vs.session_factory = mock_sf

        gid = "11111111-1111-1111-1111-111111111111"
        # "invalid_type" should be filtered out
        results = await vs.search_group_vectors(gid, "query", content_types=["invalid_type"])
        assert results == []


# ---------------------------------------------------------------------------
# delete_paper_vectors
# ---------------------------------------------------------------------------

class TestDeletePaperVectors:

    @pytest.mark.asyncio
    async def test_delete_no_group_id(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        with pytest.raises(ValueError, match="REQUIRED"):
            await vs.delete_paper_vectors("", "p1")

    @pytest.mark.asyncio
    async def test_delete_success(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True

        mock_session = AsyncMock()
        mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[MagicMock(), MagicMock()]))
        mock_sf = MagicMock()
        mock_sf.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_sf.return_value.__aexit__ = AsyncMock(return_value=None)
        vs.session_factory = mock_sf

        count = await vs.delete_paper_vectors("g1", "p1")
        assert count == 2
        mock_session.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# get_group_vector_stats
# ---------------------------------------------------------------------------

class TestGetGroupVectorStats:

    @pytest.mark.asyncio
    async def test_stats_no_group_id(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        with pytest.raises(ValueError, match="REQUIRED"):
            await vs.get_group_vector_stats("")

    @pytest.mark.asyncio
    async def test_stats_success(self):
        from app.vector_store import VectorStore
        vs = VectorStore()
        vs._connected = True

        row_paper = MagicMock(content_type="paper", count=10)
        row_qa = MagicMock(content_type="qa", count=5)
        mock_session = AsyncMock()
        mock_session.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[row_paper, row_qa]))
        mock_sf = MagicMock()
        mock_sf.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_sf.return_value.__aexit__ = AsyncMock(return_value=None)
        vs.session_factory = mock_sf

        stats = await vs.get_group_vector_stats("g1")
        assert stats["paper"] == 10
        assert stats["qa"] == 5
        assert stats["total"] == 15
