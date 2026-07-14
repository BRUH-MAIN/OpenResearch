"""Single shared SQLAlchemy engine for the AI service.

The service previously created two independent engines (one in Database, one in
VectorStore), each with its own pool — up to ~30 connections against a database
it shares with the Node server. Both now borrow from this one pool.

Schema ownership note: this service only ever reads and writes rows. All DDL
lives in the server's Drizzle migrations (see docs/adr/0001).
"""

import logging
import ssl
from typing import Optional
from urllib.parse import urlparse, parse_qs, urlencode

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings

logger = logging.getLogger(__name__)

_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def convert_db_url_for_asyncpg(db_url: str) -> tuple[str, dict]:
    """Rewrite a libpq-style URL into one asyncpg accepts.

    asyncpg rejects `sslmode`/`channel_binding` query params that Postgres URLs
    commonly carry, so they are stripped and translated into connect_args.
    """
    parsed = urlparse(db_url)
    query_params = parse_qs(parsed.query)

    ssl_mode = query_params.pop("sslmode", [None])[0]
    query_params.pop("channel_binding", None)

    connect_args: dict = {}
    if ssl_mode in ("require", "verify-ca", "verify-full"):
        ssl_context = ssl.create_default_context()
        if ssl_mode == "require":
            # `require` means encrypt, not authenticate — matches libpq semantics.
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = ssl_context

    new_query = urlencode(
        {k: v[0] if len(v) == 1 else v for k, v in query_params.items()}, doseq=True
    )

    scheme = parsed.scheme
    if scheme in ("postgresql", "postgres"):
        scheme = "postgresql+asyncpg"

    new_url = f"{scheme}://{parsed.netloc}{parsed.path}"
    if new_query:
        new_url = f"{new_url}?{new_query}"

    return new_url, connect_args


async def init_engine() -> bool:
    """Create the engine and verify connectivity. Idempotent."""
    global _engine, _session_factory

    if _engine is not None:
        return True

    settings = get_settings()
    if not settings.database_url:
        logger.error("DATABASE_URL not configured")
        return False

    try:
        db_url, connect_args = convert_db_url_for_asyncpg(settings.database_url)

        _engine = create_async_engine(
            db_url,
            echo=settings.debug,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        _session_factory = async_sessionmaker(
            _engine, class_=AsyncSession, expire_on_commit=False
        )

        async with _engine.begin() as conn:
            await conn.execute(text("SELECT 1"))

        return True
    except Exception as exc:
        logger.error("Database connection failed: %s", exc)
        _engine = None
        _session_factory = None
        return False


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def is_connected() -> bool:
    return _engine is not None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("Database engine not initialized — call init_engine() first")
    return _session_factory
