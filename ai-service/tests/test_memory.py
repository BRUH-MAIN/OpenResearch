"""
Tests for the Mem0 Memory Adapter.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestInitialization:

    def test_default_state(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        assert adapter._memory is None
        assert adapter._enabled is False
        assert adapter._fallback_store == {}
        assert adapter._provider is None
        assert adapter.is_enabled is False

    @patch("app.memory.get_settings")
    def test_initialize_disabled(self, mock_settings):
        from app.memory import Mem0Adapter
        settings = MagicMock()
        settings.mem0_enabled = False
        mock_settings.return_value = settings

        adapter = Mem0Adapter()
        result = adapter.initialize()
        assert result is False
        assert adapter.is_enabled is False

    @patch("app.memory.get_settings")
    def test_initialize_without_mem0(self, mock_settings):
        """When mem0 package not installed, falls to fallback."""
        from app.memory import Mem0Adapter
        settings = MagicMock()
        settings.mem0_enabled = True
        mock_settings.return_value = settings

        adapter = Mem0Adapter()
        # Mock import failure
        with patch.dict("sys.modules", {"mem0": None, "mem0ai": None}):
            result = adapter.initialize()
        assert result is False

    @patch("app.memory.get_settings")
    def test_initialize_no_db_url(self, mock_settings):
        from app.memory import Mem0Adapter
        settings = MagicMock()
        settings.mem0_enabled = True
        settings.mem0_database_url = ""
        settings.database_url = ""
        mock_settings.return_value = settings

        adapter = Mem0Adapter()
        result = adapter.initialize()
        # Will fail because mem0 isn't installed or no URL
        assert result is False


class TestFallbackStore:

    def test_add_to_fallback(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        # Fallback mode (not enabled)

        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            adapter.add("test memory", "user1", "group1")
        )
        assert result is not None
        assert "id" in result

    def test_add_empty_text(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            adapter.add("", "user1", "group1")
        )
        assert result is None

    def test_add_no_user_id(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            adapter.add("some text", "", "group1")
        )
        assert result is None

    def test_search_fallback(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        loop = asyncio.get_event_loop()
        loop.run_until_complete(adapter.add("memory 1", "user1", "group1"))
        loop.run_until_complete(adapter.add("memory 2", "user1", "group1"))

        results = loop.run_until_complete(
            adapter.search("memory", "user1", "group1")
        )
        assert len(results) == 2

    def test_search_empty_query(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        results = asyncio.get_event_loop().run_until_complete(
            adapter.search("", "user1")
        )
        assert results == []

    def test_search_no_user_id(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        results = asyncio.get_event_loop().run_until_complete(
            adapter.search("query", "")
        )
        assert results == []

    def test_group_isolation(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        loop = asyncio.get_event_loop()
        loop.run_until_complete(adapter.add("group1 mem", "user1", "group1"))
        loop.run_until_complete(adapter.add("group2 mem", "user1", "group2"))

        results = loop.run_until_complete(
            adapter.search("mem", "user1", "group1")
        )
        assert len(results) == 1
        assert results[0]["text"] == "group1 mem"

    def test_multiple_adds(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        loop = asyncio.get_event_loop()
        for i in range(5):
            loop.run_until_complete(adapter.add(f"memory {i}", "user1", "group1"))

        results = loop.run_until_complete(
            adapter.search("memory", "user1", "group1")
        )
        assert len(results) == 5

    def test_search_respects_limit(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        loop = asyncio.get_event_loop()
        for i in range(10):
            loop.run_until_complete(adapter.add(f"memory {i}", "user1", "group1"))

        results = loop.run_until_complete(
            adapter.search("memory", "user1", "group1", limit=3)
        )
        assert len(results) == 3

    def test_global_group_key(self):
        """Without group_id, uses 'global' key."""
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()

        import asyncio
        loop = asyncio.get_event_loop()
        loop.run_until_complete(adapter.add("global mem", "user1"))

        results = loop.run_until_complete(
            adapter.search("global", "user1")
        )
        assert len(results) == 1


class TestMem0EnabledPath:
    """Test the Mem0-enabled path with a mocked memory instance."""

    @pytest.mark.asyncio
    async def test_add_with_mem0(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.add.return_value = {"id": "mem-1"}

        result = await adapter.add("test text", "user1", "group1")
        assert result == {"id": "mem-1"}

    @pytest.mark.asyncio
    async def test_add_with_mem0_type_error_fallback(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.add.side_effect = [TypeError("bad args"), {"id": "mem-1"}]

        result = await adapter.add("test text", "user1", "group1")
        # Should fall through to the simpler call
        assert result == {"id": "mem-1"}

    @pytest.mark.asyncio
    async def test_add_with_mem0_generic_error(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.add.side_effect = RuntimeError("fail")

        result = await adapter.add("test text", "user1", "group1")
        assert result is None

    @pytest.mark.asyncio
    async def test_search_with_mem0(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.search.return_value = [{"text": "found"}]

        results = await adapter.search("query", "user1", "group1")
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_search_with_mem0_returns_none(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.search.return_value = None

        results = await adapter.search("query", "user1")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_with_mem0_type_error(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.search.side_effect = [
            TypeError("bad args"),
            [{"text": "fallback"}],
        ]

        results = await adapter.search("query", "user1")
        assert results == [{"text": "fallback"}]

    @pytest.mark.asyncio
    async def test_search_with_mem0_generic_error(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.search.side_effect = RuntimeError("fail")

        results = await adapter.search("query", "user1")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_type_error_then_another_error(self):
        from app.memory import Mem0Adapter
        adapter = Mem0Adapter()
        adapter._enabled = True
        adapter._memory = MagicMock()
        adapter._memory.search.side_effect = [
            TypeError("bad"),
            RuntimeError("also bad"),
        ]

        results = await adapter.search("query", "user1")
        assert results == []
