"""LLM client — DeepSeek primary, Groq fallback, with retries.

Two layers of resilience:
  1. tenacity retries transient failures (connection, timeout, 429, 5xx)
     against the *same* provider with exponential backoff;
  2. if the primary provider still fails, the call is replayed against the
     fallback provider.
"""

import asyncio
import logging
import time
from typing import Any, Optional

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from .config import get_settings

logger = logging.getLogger(__name__)

# LangChain chat models — both providers are optional at import time.
_LANGCHAIN_AVAILABLE = False
_DEEPSEEK_AVAILABLE = False
_GROQ_AVAILABLE = False

ChatOpenAI: Any = None
ChatGroq: Any = None
SystemMessage: Any = None
HumanMessage: Any = None

try:
    from langchain_core.messages import SystemMessage, HumanMessage  # type: ignore[assignment]
    _LANGCHAIN_AVAILABLE = True
except Exception:  # pragma: no cover
    pass

try:
    from langchain_openai import ChatOpenAI  # type: ignore[assignment]
    _DEEPSEEK_AVAILABLE = True
except Exception:  # pragma: no cover
    pass

try:
    from langchain_groq import ChatGroq  # type: ignore[assignment]
    _GROQ_AVAILABLE = True
except Exception:  # pragma: no cover
    pass


# Provider SDKs raise their own exception types, so classify by signal rather
# than by class. Rate limits and 5xx are transient; a 401 or 400 is not.
_RETRYABLE_MARKERS = ("429", "rate limit", "rate_limit", "500", "502", "503", "504",
                      "overloaded", "timeout", "temporarily unavailable")


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, (ConnectionError, TimeoutError, asyncio.TimeoutError)):
        return True
    message = str(exc).lower()
    return any(marker in message for marker in _RETRYABLE_MARKERS)


def _create_deepseek_llm(api_key: str, model: str, temperature: float = 0.7) -> Any:
    """DeepSeek speaks the OpenAI wire format, so ChatOpenAI + a base_url is enough."""
    settings = get_settings()
    return ChatOpenAI(
        api_key=api_key,
        model=model,
        base_url=settings.deepseek_base_url,
        temperature=temperature,
    )


def _create_groq_llm(api_key: str, model: str, temperature: float = 0.7) -> Any:
    return ChatGroq(
        api_key=api_key,
        model_name=model,
        temperature=temperature,
    )


class LLMClient:
    """Chat-completion client with provider fallback."""

    def __init__(self) -> None:
        settings = get_settings()
        self._deepseek_api_key = settings.deepseek_api_key
        self._deepseek_model = settings.deepseek_model
        self._groq_api_key = settings.groq_api_key
        self._groq_model = settings.groq_model

        self.provider: str = settings.llm_provider
        self.model_name: str = ""
        self._llm: Any = None
        self._fallback_llm: Any = None
        self._initialized = False

    def initialize(self) -> bool:
        """Wire up the providers. True if at least one is usable."""
        if not _LANGCHAIN_AVAILABLE:
            logger.warning("langchain-core not available — AI features disabled")
            return False

        if _DEEPSEEK_AVAILABLE and self._deepseek_api_key:
            try:
                self._llm = _create_deepseek_llm(self._deepseek_api_key, self._deepseek_model)
                self.provider = "deepseek"
                self.model_name = self._deepseek_model
                logger.info("Primary LLM: DeepSeek (%s)", self._deepseek_model)
            except Exception as exc:
                logger.warning("DeepSeek init failed: %s — will try Groq", exc)
                self._llm = None

        if _GROQ_AVAILABLE and self._groq_api_key:
            try:
                groq_llm = _create_groq_llm(self._groq_api_key, self._groq_model)
                if self._llm is None:
                    self._llm = groq_llm
                    self.provider = "groq"
                    self.model_name = self._groq_model
                    logger.info("Primary LLM (fallback promoted): Groq (%s)", self._groq_model)
                else:
                    self._fallback_llm = groq_llm
                    logger.info("Fallback LLM: Groq (%s)", self._groq_model)
            except Exception as exc:
                logger.warning("Groq init failed: %s", exc)

        if self._llm is None:
            logger.warning("No LLM provider available — set DEEPSEEK_API_KEY or GROQ_API_KEY")
            return False

        self._initialized = True
        return True

    @property
    def is_configured(self) -> bool:
        return self._initialized and self._llm is not None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(_is_retryable),
        reraise=True,
    )
    async def _invoke_primary(self, messages: list) -> Any:
        return await self._llm.ainvoke(messages)

    async def _invoke_with_fallback(self, messages: list) -> Any:
        try:
            return await self._invoke_primary(messages)
        except Exception as primary_err:
            if self._fallback_llm is None:
                raise
            logger.warning(
                "Primary LLM (%s) failed: %s — falling back", self.provider, primary_err
            )
            return await self._fallback_llm.ainvoke(messages)

    @staticmethod
    def _build_messages(prompt: str, system_instruction: Optional[str]) -> list:
        messages = []
        if system_instruction:
            messages.append(SystemMessage(content=system_instruction))
        messages.append(HumanMessage(content=prompt))
        return messages

    async def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> tuple[str, int]:
        """Generate a full response. Returns (text, latency_ms)."""
        if not self.is_configured:
            raise RuntimeError("LLM client not initialized. Set DEEPSEEK_API_KEY or GROQ_API_KEY.")

        start_time = time.time()
        response = await self._invoke_with_fallback(
            self._build_messages(prompt, system_instruction)
        )

        text = response.content if hasattr(response, "content") else str(response)
        if not text:
            raise RuntimeError("Empty response from LLM API")

        return text, int((time.time() - start_time) * 1000)

    async def generate_stream(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ):
        """Yield response tokens as they arrive."""
        if not self.is_configured:
            raise RuntimeError("LLM client not initialized.")

        messages = self._build_messages(prompt, system_instruction)

        try:
            async for chunk in self._llm.astream(messages):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if token:
                    yield token
        except Exception as primary_err:
            if self._fallback_llm is None:
                raise
            logger.warning("Primary LLM stream failed: %s — falling back", primary_err)
            async for chunk in self._fallback_llm.astream(messages):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if token:
                    yield token


# Singleton instance
llm_client = LLMClient()
