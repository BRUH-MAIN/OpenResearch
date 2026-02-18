"""Tests for the Mem0 memory adapter."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.memory import Mem0Adapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def adapter():
    """Return a fresh Mem0Adapter (not initialized, using fallback store)."""
    return Mem0Adapter()


# ---------------------------------------------------------------------------
# Initialization Tests
# ---------------------------------------------------------------------------

class TestInitialization:

    def test_default_state(self, adapter):
        assert adapter._enabled is False
        assert adapter._memory is None
        assert adapter._fallback_store == {}

    @patch("app.memory.get_settings")
    def test_initialize_without_mem0(self, mock_settings, adapter):
        settings = MagicMock()
        settings.mem0_api_key = ""
        mock_settings.return_value = settings

        result = adapter.initialize()
        # Should still succeed (fallback mode)
        assert adapter._enabled is False


# ---------------------------------------------------------------------------
# Fallback Store Tests
# ---------------------------------------------------------------------------

class TestFallbackStore:

    @pytest.mark.asyncio
    async def test_add_to_fallback(self, adapter):
        result = await adapter.add(
            text="test memory",
            user_id="user-1",
            group_id="group-1",
            memory_type="test",
        )
        # Should not raise; may return None or an ID
        key = "user-1:group-1"
        assert key in adapter._fallback_store
        assert len(adapter._fallback_store[key]) == 1

    @pytest.mark.asyncio
    async def test_add_empty_text(self, adapter):
        result = await adapter.add(
            text="",
            user_id="user-1",
            group_id="group-1",
        )
        # Empty text should be a no-op or return None
        key = "user-1:group-1"
        assert len(adapter._fallback_store.get(key, [])) == 0

    @pytest.mark.asyncio
    async def test_search_fallback(self, adapter):
        await adapter.add(
            text="deep learning for NLP",
            user_id="user-1",
            group_id="group-1",
        )
        results = await adapter.search(
            query="deep learning",
            user_id="user-1",
            group_id="group-1",
        )
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_search_empty_query(self, adapter):
        results = await adapter.search(
            query="",
            user_id="user-1",
            group_id="group-1",
        )
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_group_isolation(self, adapter):
        """Memories from different groups should not bleed."""
        await adapter.add(
            text="group A memory",
            user_id="user-1",
            group_id="group-A",
        )
        await adapter.add(
            text="group B memory",
            user_id="user-1",
            group_id="group-B",
        )

        key_a = "user-1:group-A"
        key_b = "user-1:group-B"
        assert len(adapter._fallback_store.get(key_a, [])) == 1
        assert len(adapter._fallback_store.get(key_b, [])) == 1

    @pytest.mark.asyncio
    async def test_multiple_adds(self, adapter):
        for i in range(5):
            await adapter.add(
                text=f"memory {i}",
                user_id="user-1",
                group_id="group-1",
            )
        key = "user-1:group-1"
        assert len(adapter._fallback_store[key]) == 5
