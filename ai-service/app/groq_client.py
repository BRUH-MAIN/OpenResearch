"""Groq AI client wrapper using LangChain ChatGroq with retries."""

import asyncio
import logging
import re
import time
from typing import Any, Optional

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .config import get_settings

logger = logging.getLogger(__name__)

try:
    from langchain_groq import ChatGroq
    from langchain_core.messages import SystemMessage, HumanMessage
    _LANGCHAIN_AVAILABLE = True
except Exception:  # pragma: no cover
    ChatGroq = None  # type: ignore[assignment]
    SystemMessage = None  # type: ignore[assignment]
    HumanMessage = None  # type: ignore[assignment]
    _LANGCHAIN_AVAILABLE = False


class GroqClient:
    """Wrapper for Groq API using ChatGroq (LangChain) with retries."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.groq_api_key
        self.model_name = settings.groq_model
        self._llm: Any = None
        self._initialized = False

    def initialize(self) -> bool:
        """Initialize the ChatGroq client. Returns True if successful."""
        if not _LANGCHAIN_AVAILABLE:
            logger.warning("langchain-groq not available - AI features disabled")
            return False
        if not self.api_key:
            logger.warning("GROQ_API_KEY not set - AI features will be unavailable")
            return False
        try:
            self._llm = ChatGroq(
                api_key=self.api_key,
                model_name=self.model_name,
                temperature=0.7,
            )
            self._initialized = True
            logger.info("Groq client initialized with model: %s", self.model_name)
            return True
        except Exception as e:
            logger.error("Failed to initialize Groq client: %s", e)
            return False

    @property
    def is_configured(self) -> bool:
        """Check if the client is properly configured."""
        return self._initialized and self._llm is not None

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
        Generate a response from Groq using ChatGroq (async-native).

        Returns:
            Tuple of (response_text, latency_ms)
        """
        if not self.is_configured:
            raise RuntimeError("Groq client not initialized. Please set GROQ_API_KEY.")

        start_time = time.time()

        # Use the provided model or default
        llm = self._llm
        if model and model != self.model_name:
            llm = ChatGroq(
                api_key=self.api_key,
                model_name=model,
                temperature=temperature,
            )

        messages = []
        if system_instruction:
            messages.append(SystemMessage(content=system_instruction))
        messages.append(HumanMessage(content=prompt))

        response = await llm.ainvoke(messages)

        response_text = response.content if hasattr(response, "content") else str(response)
        if not response_text:
            raise RuntimeError("Empty response from Groq API")

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
        Stream a response from Groq token-by-token using ChatGroq.astream().

        Yields:
            Individual token strings as they arrive.
        """
        if not self.is_configured:
            raise RuntimeError("Groq client not initialized. Please set GROQ_API_KEY.")

        llm = self._llm
        if model and model != self.model_name:
            llm = ChatGroq(
                api_key=self.api_key,
                model_name=model,
                temperature=temperature,
            )

        messages = []
        if system_instruction:
            messages.append(SystemMessage(content=system_instruction))
        messages.append(HumanMessage(content=prompt))

        async for chunk in llm.astream(messages):
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            if token:
                yield token

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
