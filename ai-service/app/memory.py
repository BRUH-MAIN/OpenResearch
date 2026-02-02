"""Mem0 memory adapter with graceful fallback."""

from __future__ import annotations

import asyncio
from typing import Optional, Any

from .config import get_settings


class Mem0Adapter:
    """Adapter for Mem0 memory with a fallback in-memory store."""

    def __init__(self) -> None:
        self._memory: Optional[Any] = None
        self._enabled = False
        self._fallback_store: dict[str, list[dict]] = {}
        self._provider: Optional[str] = None

    def initialize(self) -> bool:
        """Initialize Mem0 if available. Returns True if enabled."""
        settings = get_settings()
        if not settings.mem0_enabled:
            return False

        try:
            memory_cls = None
            try:
                from mem0 import Memory as Mem0Memory  # type: ignore
                memory_cls = Mem0Memory
                self._provider = "mem0"
            except Exception:
                try:
                    from mem0ai import Memory as Mem0Memory  # type: ignore
                    memory_cls = Mem0Memory
                    self._provider = "mem0ai"
                except Exception:
                    memory_cls = None

            if memory_cls is None:
                print("⚠️  Mem0 not installed - using fallback memory")
                self._enabled = False
                return False

            pg_url = settings.mem0_database_url or settings.database_url
            if not pg_url:
                print("⚠️  Mem0 database URL not configured - using fallback memory")
                self._enabled = False
                return False

            config = {
                "vector_store": {
                    "provider": "pgvector",
                    "config": {
                        "connection_string": pg_url,
                        "collection_name": settings.mem0_collection,
                    },
                },
                "llm": {
                    "provider": "groq",
                    "config": {
                        "api_key": settings.groq_api_key,
                        "model": settings.groq_model,
                    },
                },
            }

            self._memory = memory_cls.from_config(config)
            self._enabled = True
            print(f"✅ Mem0 memory initialized ({self._provider})")
            return True

        except Exception as exc:
            print(f"⚠️  Mem0 initialization failed: {exc}")
            self._enabled = False
            return False

    @property
    def is_enabled(self) -> bool:
        return self._enabled and self._memory is not None

    async def add(
        self,
        text: str,
        user_id: str,
        group_id: Optional[str] = None,
        memory_type: str = "user",
        metadata: Optional[dict] = None,
    ) -> Optional[dict]:
        if not text or not user_id:
            return None

        payload_meta = {
            "group_id": group_id,
            "memory_type": memory_type,
            **(metadata or {}),
        }

        if self.is_enabled:
            try:
                return await asyncio.to_thread(
                    self._memory.add,
                    text,
                    user_id=user_id,
                    metadata=payload_meta,
                )
            except TypeError:
                return await asyncio.to_thread(self._memory.add, text, user_id)
            except Exception:
                return None

        key = f"{user_id}:{group_id or 'global'}"
        self._fallback_store.setdefault(key, []).append(
            {"text": text, "metadata": payload_meta}
        )
        return {"id": f"fallback-{len(self._fallback_store[key])}"}

    async def search(
        self,
        query: str,
        user_id: str,
        group_id: Optional[str] = None,
        limit: int = 5,
    ) -> list[dict]:
        if not query or not user_id:
            return []

        if self.is_enabled:
            try:
                results = await asyncio.to_thread(
                    self._memory.search,
                    query,
                    user_id=user_id,
                    limit=limit,
                )
                return results or []
            except TypeError:
                try:
                    results = await asyncio.to_thread(
                        self._memory.search,
                        query,
                        user_id,
                    )
                    return results or []
                except Exception:
                    return []
            except Exception:
                return []

        key = f"{user_id}:{group_id or 'global'}"
        return list(reversed(self._fallback_store.get(key, [])))[:limit]


mem0_adapter = Mem0Adapter()
