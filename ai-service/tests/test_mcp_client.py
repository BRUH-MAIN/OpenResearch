"""Tests for the MCP client."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.mcp_client import MCPClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    return MCPClient()


# ---------------------------------------------------------------------------
# Initialization Tests
# ---------------------------------------------------------------------------

class TestInitialization:

    @patch("app.mcp_client.get_settings")
    def test_initialize_with_urls(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = '{"academic_papers": "http://localhost:8100"}'
        mock_settings.return_value = settings

        result = client.initialize()
        assert result is True
        assert "academic_papers" in client._server_urls
        assert client._server_urls["academic_papers"] == "http://localhost:8100"

    @patch("app.mcp_client.get_settings")
    def test_initialize_empty_urls(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = ""
        settings.mcp_request_timeout = 30
        mock_settings.return_value = settings

        result = client.initialize()
        # initialize always returns True but no servers are registered
        assert result is True
        assert client._server_urls == {}

    @patch("app.mcp_client.get_settings")
    def test_initialize_invalid_json(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = "not-valid-json"
        settings.mcp_request_timeout = 30
        mock_settings.return_value = settings

        result = client.initialize()
        # initialize returns True but falls back to empty dict
        assert result is True
        assert client._server_urls == {}

    @patch("app.mcp_client.get_settings")
    def test_is_configured(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = '{"academic_papers": "http://localhost:8100"}'
        mock_settings.return_value = settings
        client.initialize()

        assert client.is_configured("academic_papers") is True
        assert client.is_configured("nonexistent") is False


# ---------------------------------------------------------------------------
# Invocation Tests
# ---------------------------------------------------------------------------

class TestInvocation:

    @pytest.mark.asyncio
    @patch("app.mcp_client.get_settings")
    async def test_invoke_success(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = '{"academic_papers": "http://localhost:8100"}'
        mock_settings.return_value = settings
        client.initialize()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"papers": [{"title": "Test"}]}

        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        client._client = mock_http_client

        result = await client.invoke(
            "academic_papers",
            "search_arxiv",
            {"query": "NLP", "limit": 5},
        )
        assert "papers" in result

    @pytest.mark.asyncio
    @patch("app.mcp_client.get_settings")
    async def test_invoke_unconfigured_server(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = '{"academic_papers": "http://localhost:8100"}'
        mock_settings.return_value = settings
        client.initialize()

        with pytest.raises((RuntimeError, KeyError)):
            await client.invoke(
                "unknown_server",
                "some_tool",
                {"query": "test"},
            )

    @pytest.mark.asyncio
    @patch("app.mcp_client.get_settings")
    async def test_invoke_fallback_to_invoke_path(self, mock_settings, client):
        """When /tools/{name} returns 404, invoke should try /invoke."""
        settings = MagicMock()
        settings.mcp_server_urls = '{"server": "http://localhost:9000"}'
        mock_settings.return_value = settings
        client.initialize()

        not_found = MagicMock()
        not_found.status_code = 404

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.json.return_value = {"data": "fallback"}

        mock_http = AsyncMock()
        mock_http.post = AsyncMock(side_effect=[not_found, ok_response])
        client._client = mock_http

        result = await client.invoke("server", "tool", {"key": "val"})
        assert result == {"data": "fallback"}
        assert mock_http.post.call_count == 2

    @pytest.mark.asyncio
    @patch("app.mcp_client.get_settings")
    async def test_invoke_http_error_raises_runtime(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = '{"server": "http://localhost:9000"}'
        mock_settings.return_value = settings
        client.initialize()

        mock_http = AsyncMock()
        mock_http.post = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )
        client._client = mock_http

        with pytest.raises(RuntimeError, match="MCP invocation failed"):
            await client.invoke("server", "tool", {})


# ---------------------------------------------------------------------------
# Health Check Tests
# ---------------------------------------------------------------------------

class TestHealthCheck:

    @pytest.mark.asyncio
    @patch("app.mcp_client.get_settings")
    async def test_health_check_all_healthy(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = '{"s1": "http://localhost:8001", "s2": "http://localhost:8002"}'
        mock_settings.return_value = settings
        client.initialize()

        ok_response = MagicMock()
        ok_response.status_code = 200

        mock_http = AsyncMock()
        mock_http.get = AsyncMock(return_value=ok_response)
        client._client = mock_http

        results = await client.health_check()
        assert results == {"s1": True, "s2": True}

    @pytest.mark.asyncio
    @patch("app.mcp_client.get_settings")
    async def test_health_check_one_down(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = '{"s1": "http://localhost:8001", "s2": "http://localhost:8002"}'
        mock_settings.return_value = settings
        client.initialize()

        ok = MagicMock(status_code=200)

        mock_http = AsyncMock()
        mock_http.get = AsyncMock(side_effect=[ok, Exception("unreachable")])
        client._client = mock_http

        results = await client.health_check()
        assert results["s1"] is True
        assert results["s2"] is False

    @pytest.mark.asyncio
    @patch("app.mcp_client.get_settings")
    async def test_health_check_no_servers(self, mock_settings, client):
        settings = MagicMock()
        settings.mcp_server_urls = ""
        settings.mcp_request_timeout = 30
        mock_settings.return_value = settings
        client.initialize()

        results = await client.health_check()
        assert results == {}
