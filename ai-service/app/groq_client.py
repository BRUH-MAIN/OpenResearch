"""LLM client wrapper — DeepSeek primary, Groq fallback, with retries."""

import asyncio
import logging
import re
import time
from typing import Any, Optional

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Import LangChain chat models — both providers are optional at import time.
# ---------------------------------------------------------------------------
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


def _create_deepseek_llm(api_key: str, model: str, temperature: float = 0.7) -> Any:
    """Create a DeepSeek LLM instance via OpenAI-compatible endpoint."""
    settings = get_settings()
    return ChatOpenAI(
        api_key=api_key,
        model=model,
        base_url=settings.deepseek_base_url,
        temperature=temperature,
    )


def _create_groq_llm(api_key: str, model: str, temperature: float = 0.7) -> Any:
    """Create a Groq LLM instance."""
    return ChatGroq(
        api_key=api_key,
        model_name=model,
        temperature=temperature,
    )


class GroqClient:
    """Wrapper for LLM API — DeepSeek primary, Groq fallback."""

    def __init__(self):
        settings = get_settings()
        # Primary: DeepSeek
        self._deepseek_api_key = settings.deepseek_api_key
        self._deepseek_model = settings.deepseek_model
        # Fallback: Groq
        self._groq_api_key = settings.groq_api_key
        self._groq_model = settings.groq_model
        # Active provider tracking
        self._provider = settings.llm_provider  # "deepseek" or "groq"
        self.api_key: str = ""
        self.model_name: str = ""
        self._llm: Any = None
        self._fallback_llm: Any = None
        self._initialized = False

    def initialize(self) -> bool:
        """Initialize LLM client. DeepSeek primary, Groq fallback. Returns True if at least one works."""
        if not _LANGCHAIN_AVAILABLE:
            logger.warning("langchain-core not available - AI features disabled")
            return False

        # --- try DeepSeek first ---
        if _DEEPSEEK_AVAILABLE and self._deepseek_api_key:
            try:
                self._llm = _create_deepseek_llm(
                    self._deepseek_api_key, self._deepseek_model
                )
                self._provider = "deepseek"
                self.api_key = self._deepseek_api_key
                self.model_name = self._deepseek_model
                logger.info("Primary LLM: DeepSeek (%s)", self._deepseek_model)
            except Exception as e:
                logger.warning("DeepSeek init failed: %s — will try Groq", e)
                self._llm = None

        # --- try Groq as fallback (or primary if DeepSeek unavailable) ---
        if _GROQ_AVAILABLE and self._groq_api_key:
            try:
                groq_llm = _create_groq_llm(
                    self._groq_api_key, self._groq_model
                )
                if self._llm is None:
                    # DeepSeek failed — promote Groq to primary
                    self._llm = groq_llm
                    self._provider = "groq"
                    self.api_key = self._groq_api_key
                    self.model_name = self._groq_model
                    logger.info("Primary LLM (fallback): Groq (%s)", self._groq_model)
                else:
                    self._fallback_llm = groq_llm
                    logger.info("Fallback LLM: Groq (%s)", self._groq_model)
            except Exception as e:
                logger.warning("Groq init failed: %s", e)

        if self._llm is None:
            logger.warning("No LLM provider available — AI features disabled")
            return False

        self._initialized = True
        return True

    @property
    def is_configured(self) -> bool:
        """Check if the client is properly configured."""
        return self._initialized and self._llm is not None

    async def _invoke_with_fallback(self, messages: list, **kwargs) -> Any:
        """Invoke the primary LLM; on failure fall back to the secondary."""
        try:
            return await self._llm.ainvoke(messages, **kwargs)
        except Exception as primary_err:
            if self._fallback_llm is not None:
                logger.warning(
                    "Primary LLM (%s) failed: %s — falling back to secondary",
                    self._provider, primary_err,
                )
                return await self._fallback_llm.ainvoke(messages, **kwargs)
            raise  # no fallback available

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError, asyncio.TimeoutError)),
    )
    async def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> tuple[str, int]:
        """
        Generate a response using the active LLM (DeepSeek → Groq fallback).

        Returns:
            Tuple of (response_text, latency_ms)
        """
        if not self.is_configured:
            raise RuntimeError("LLM client not initialized. Set DEEPSEEK_API_KEY or GROQ_API_KEY.")

        start_time = time.time()

        messages = []
        if system_instruction:
            messages.append(SystemMessage(content=system_instruction))
        messages.append(HumanMessage(content=prompt))

        response = await self._invoke_with_fallback(messages)

        response_text = response.content if hasattr(response, "content") else str(response)
        if not response_text:
            raise RuntimeError("Empty response from LLM API")

        latency_ms = int((time.time() - start_time) * 1000)
        return response_text, latency_ms

    async def generate_stream(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ):
        """
        Stream a response token-by-token.

        Yields:
            Individual token strings as they arrive.
        """
        if not self.is_configured:
            raise RuntimeError("LLM client not initialized.")

        messages = []
        if system_instruction:
            messages.append(SystemMessage(content=system_instruction))
        messages.append(HumanMessage(content=prompt))

        # Try primary, fall back on error
        try:
            async for chunk in self._llm.astream(messages):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if token:
                    yield token
        except Exception as primary_err:
            if self._fallback_llm is not None:
                logger.warning(
                    "Primary LLM stream failed: %s — falling back", primary_err
                )
                async for chunk in self._fallback_llm.astream(messages):
                    token = chunk.content if hasattr(chunk, "content") else str(chunk)
                    if token:
                        yield token
            else:
                raise

    async def chat_qa(
        self,
        question: str,
        context_messages: list[dict],
        papers: list[dict],
        session_title: str = "Research Session",
    ) -> tuple[str, list[str], int]:
        """
        Answer a question based on session context.

        Returns:
            Tuple of (answer, source_message_ids, latency_ms)
        """
        try:
            context_parts = []

            if context_messages:
                messages_text = "\n".join([
                    f"[MSG-{i}] [{msg.get('user_name', 'Unknown')}]: {msg.get('content', '')}"
                    for i, msg in enumerate(context_messages)
                ])
                context_parts.append(f"## Recent Messages\n{messages_text}")

            if papers:
                papers_text = "\n".join([
                    f"[PAPER-{i}] {p.get('title', 'Untitled')} - {p.get('abstract', '')[:500]}..."
                    for i, p in enumerate(papers)
                ])
                context_parts.append(f"## Linked Papers\n{papers_text}")

            context = "\n\n".join(context_parts) if context_parts else "No context available."

            system_instruction = """You are an AI research assistant for OpenResearch, a collaboration platform for research teams.
Your role is to help researchers by answering questions based on their discussion context and linked papers.

Guidelines:
- Answer based on the provided context (messages and papers)
- If the answer cannot be found in the context, say so clearly
- Reference specific messages (MSG-X) or papers (PAPER-X) when relevant
- Be concise, accurate, and helpful
- Use academic language appropriate for researchers"""

            prompt = f"""Session: {session_title}

{context}

---

Question: {question}

Provide a helpful answer based on the context above. Reference specific messages or papers when applicable."""

            response_text, latency_ms = await self.generate(
                prompt=prompt,
                system_instruction=system_instruction,
                temperature=0.5,
                max_tokens=1024,
            )

            # Extract source references from the response
            sources = []
            msg_refs = re.findall(r'MSG-(\d+)', response_text)
            for ref in msg_refs:
                idx = int(ref)
                if idx < len(context_messages):
                    msg_id = context_messages[idx].get('id')
                    if msg_id and msg_id not in sources:
                        sources.append(msg_id)

            return response_text, sources, latency_ms
        except Exception as exc:
            logger.error("chat_qa failed: %s", exc, exc_info=True)
            return f"I encountered an error processing your question: {exc}", [], 0

    async def summarize_session(
        self,
        messages: list[dict],
        session_title: str,
    ) -> tuple[str, list[str], int]:
        """
        Summarize a session's discussion.

        Returns:
            Tuple of (summary, key_points, latency_ms)
        """
        if not messages:
            return "No messages to summarize.", [], 0

        try:
            messages_text = "\n".join([
                f"[{msg.get('user_name', 'Unknown')}]: {msg.get('content', '')}"
                for msg in messages
                if msg.get('type') == 'user'
            ])

            system_instruction = """You are an AI assistant that creates concise summaries of research discussions.
Focus on key decisions, insights, and action items discussed by the team."""

            prompt = f"""Session: {session_title}

Discussion:
{messages_text}

---

Please provide:
1. A concise summary (2-3 paragraphs)
2. Key points (max 5 bullet points)

Format:
SUMMARY:
[Your summary]

KEY POINTS:
- Point 1
- Point 2
..."""

            response_text, latency_ms = await self.generate(
                prompt=prompt,
                system_instruction=system_instruction,
                temperature=0.3,
                max_tokens=1024,
            )

            # Parse response
            summary = ""
            key_points = []

            if "SUMMARY:" in response_text:
                parts = response_text.split("KEY POINTS:")
                summary = parts[0].replace("SUMMARY:", "").strip()
                if len(parts) > 1:
                    points_text = parts[1].strip()
                    key_points = [
                        line.strip().lstrip("-•").strip()
                        for line in points_text.split("\n")
                        if line.strip() and line.strip() not in ["-", "•"]
                    ][:5]
            else:
                summary = response_text.strip()

            return summary, key_points, latency_ms
        except Exception as exc:
            logger.error("summarize_session failed: %s", exc, exc_info=True)
            return f"Failed to summarize session: {exc}", [], 0


# Singleton instance
groq_client = GroqClient()
