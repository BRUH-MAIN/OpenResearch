"""Minimal MCP client for invoking external tool servers."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from .config import get_settings

logger = logging.getLogger(__name__)


class MCPClient:
    """Client for MCP tool servers using HTTP endpoints."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._server_urls: dict[str, str] = {}

    def initialize(self) -> bool:
        settings = get_settings()
        if settings.mcp_server_urls:
            try:
                self._server_urls = json.loads(settings.mcp_server_urls)
            except json.JSONDecodeError:
                logger.warning("MCP_SERVER_URLS is not valid JSON")
                self._server_urls = {}

        self._client = httpx.AsyncClient(timeout=settings.mcp_request_timeout)
        return True

    @property
    def server_urls(self) -> dict[str, str]:
        return self._server_urls

    def is_configured(self, server_name: str) -> bool:
        return bool(self._server_urls.get(server_name))

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
    )
    async def invoke(self, server_name: str, tool_name: str, params: dict[str, Any]) -> dict[str, Any]:
        if not self._client:
            self.initialize()

        base_url = self._server_urls.get(server_name)
        if not base_url:
            raise RuntimeError(f"MCP server '{server_name}' is not configured")

        base_url = base_url.rstrip("/")
        tool_path = f"{base_url}/tools/{tool_name}"
        invoke_path = f"{base_url}/invoke"

        try:
            response = await self._client.post(tool_path, json=params)
            if response.status_code == 404:
                response = await self._client.post(
                    invoke_path,
                    json={"tool": tool_name, "params": params},
                )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            logger.warning(
                "MCP invocation failed for %s/%s: %s", server_name, tool_name, exc
            )
            raise RuntimeError(f"MCP invocation failed: {exc}") from exc

    async def health_check(self) -> dict[str, bool]:
        """Ping each configured server and return a status dict."""
        if not self._client:
            self.initialize()

        results: dict[str, bool] = {}
        for name, url in self._server_urls.items():
            try:
                resp = await self._client.get(url.rstrip("/") + "/health")
                results[name] = resp.status_code < 400
            except Exception:
                results[name] = False
        return results


mcp_client = MCPClient()
