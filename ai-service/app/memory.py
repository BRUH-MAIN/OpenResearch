"""Mem0 memory adapter for user/group conversation memory.

Provides an optional integration with Mem0 for long-term memory storage.
Falls back to an in-memory dictionary when Mem0 is not available or disabled.
"""

import logging
import uuid
from typing import Optional

from .config import get_settings

logger = logging.getLogger(__name__)


class Mem0Adapter:
    """Adapter for Mem0 memory with in-memory fallback.

    When Mem0 is enabled and installed, stores memories in Mem0.
    Otherwise uses a simple in-memory dictionary keyed by (user_id, group_id).
    """

    def __init__(self):
        self._memory = None
        self._enabled = False
        self._fallback_store: dict[tuple[str, str], list[dict]] = {}
        self._provider: Optional[str] = None

    @property
    def is_enabled(self) -> bool:
        """Whether the Mem0 backend is active (not fallback)."""
        return self._enabled

    def initialize(self) -> bool:
        """Initialize the memory adapter. Returns True if Mem0 backend is ready."""
        settings = get_settings()

        if not getattr(settings, "mem0_enabled", False):
            logger.info("Mem0 memory disabled by config")
            return False

        # Try to import and initialise Mem0
        try:
            import importlib
            mem0 = importlib.import_module("mem0")
            if mem0 is None:
                raise ImportError("mem0 module is None")
        except (ImportError, ModuleNotFoundError):
            try:
                import importlib
                mem0 = importlib.import_module("mem0ai")
                if mem0 is None:
                    raise ImportError("mem0ai module is None")
            except (ImportError, ModuleNotFoundError):
                logger.warning("mem0/mem0ai package not installed — using fallback store")
                return False

        db_url = getattr(settings, "mem0_database_url", "") or getattr(settings, "database_url", "")
        if not db_url:
            logger.warning("No database URL for Mem0 — using fallback store")
            return False

        try:
            Memory = getattr(mem0, "Memory", None)
            if Memory is None:
                logger.warning("mem0.Memory not found — using fallback store")
                return False
            self._memory = Memory()
            self._enabled = True
            self._provider = "mem0"
            logger.info("Mem0 memory adapter initialized")
            return True
        except Exception as exc:
            logger.error("Failed to initialize Mem0: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def add(
        self,
        text: str,
        user_id: str,
        group_id: Optional[str] = None,
    ) -> Optional[dict]:
        """Add a memory entry.

        Returns dict with ``id`` on success, ``None`` on failure.
        """
        if not text or not user_id:
            return None

        if self._enabled and self._memory is not None:
            return self._add_mem0(text, user_id, group_id)

        return self._add_fallback(text, user_id, group_id)

    async def search(
        self,
        query: str,
        user_id: str,
        group_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list[dict]:
        """Search memories.

        Returns a list of memory dicts (may contain ``text`` key).
        """
        if not query or not user_id:
            return []

        if self._enabled and self._memory is not None:
            return self._search_mem0(query, user_id, group_id, limit)

        return self._search_fallback(query, user_id, group_id, limit)

    # ------------------------------------------------------------------
    # Mem0-backed methods
    # ------------------------------------------------------------------

    def _add_mem0(self, text: str, user_id: str, group_id: Optional[str]) -> Optional[dict]:
        try:
            return self._memory.add(
                text,
                user_id=user_id,
                metadata={"group_id": group_id or "global"},
            )
        except TypeError:
            # Older mem0 API variant — try without metadata
            try:
                return self._memory.add(text, user_id=user_id)
            except Exception:
                return None
        except Exception as exc:
            logger.error("Mem0 add failed: %s", exc)
            return None

    def _search_mem0(
        self,
        query: str,
        user_id: str,
        group_id: Optional[str],
        limit: Optional[int],
    ) -> list[dict]:
        try:
            results = self._memory.search(
                query,
                user_id=user_id,
                metadata={"group_id": group_id or "global"},
                limit=limit,
            )
            return results if results is not None else []
        except TypeError:
            # Older mem0 API — try simpler call
            try:
                results = self._memory.search(query, user_id=user_id)
                return results if results is not None else []
            except Exception:
                return []
        except Exception as exc:
            logger.error("Mem0 search failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # In-memory fallback
    # ------------------------------------------------------------------

    def _add_fallback(self, text: str, user_id: str, group_id: Optional[str]) -> dict:
        key = (user_id, group_id or "global")
        entry = {"id": str(uuid.uuid4()), "text": text, "user_id": user_id}
        self._fallback_store.setdefault(key, []).append(entry)
        return entry

    def _search_fallback(
        self,
        query: str,
        user_id: str,
        group_id: Optional[str],
        limit: Optional[int],
    ) -> list[dict]:
        key = (user_id, group_id or "global")
        entries = self._fallback_store.get(key, [])
        # Simple substring match
        matched = [e for e in entries if query.lower() in e["text"].lower()]
        if limit is not None:
            matched = matched[:limit]
        return matched


# Singleton instance
memory_adapter = Mem0Adapter()
