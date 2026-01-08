"""Gemini AI client wrapper with error handling and retries."""

import asyncio
import time
from typing import Optional
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .config import get_settings


class GeminiClient:
    """Wrapper for Google Gemini API with retries and error handling."""
    
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.model_name = settings.gemini_model
        self.client: Optional[genai.Client] = None
        self._initialized = False
        
    def initialize(self) -> bool:
        """Initialize the Gemini client. Returns True if successful."""
        if not self.api_key:
            print("⚠️  GEMINI_API_KEY not set - AI features will be unavailable")
            return False
        try:
            # Initialize client with API key using new Google GenAI SDK
            self.client = genai.Client(api_key=self.api_key)
            self._initialized = True
            print(f"✅ Gemini client initialized with model: {self.model_name}")
            return True
        except Exception as e:
            print(f"❌ Failed to initialize Gemini client: {e}")
            return False
    
    @property
    def is_configured(self) -> bool:
        """Check if the client is properly configured."""
        return self._initialized and self.client is not None
    
    def _sync_generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> str:
        """
        Synchronous generate call using new Google GenAI SDK.
        Reference pattern:
            client = genai.Client()
            response = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents="...",
            )
        """
        if not self.is_configured:
            raise RuntimeError("Gemini client not initialized. Please set GEMINI_API_KEY.")
        
        # Build generation config
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        
        if system_instruction:
            config.system_instruction = system_instruction
        
        # Use new SDK pattern - synchronous call
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=config,
        )
        
        if response.text:
            return response.text
        else:
            raise RuntimeError("Empty response from Gemini API")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
    )
    async def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> tuple[str, int]:
        """
        Generate a response from Gemini (async wrapper).
        
        Uses asyncio.to_thread to run sync SDK call without blocking.
        
        Returns:
            Tuple of (response_text, latency_ms)
        """
        start_time = time.time()
        
        # Run sync call in thread pool to avoid blocking
        response_text = await asyncio.to_thread(
            self._sync_generate,
            prompt,
            system_instruction,
            temperature,
            max_tokens,
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        return response_text, latency_ms
    
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
        # Build context string
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
        import re
        msg_refs = re.findall(r'MSG-(\d+)', response_text)
        for ref in msg_refs:
            idx = int(ref)
            if idx < len(context_messages):
                msg_id = context_messages[idx].get('id')
                if msg_id and msg_id not in sources:
                    sources.append(msg_id)
        
        return response_text, sources, latency_ms
    
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


# Singleton instance
gemini_client = GeminiClient()
