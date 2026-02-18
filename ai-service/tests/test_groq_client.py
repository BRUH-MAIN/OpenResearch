"""Tests for the Groq client wrapper."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.groq_client import GroqClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    return GroqClient()


@pytest.fixture
def configured_client(client):
    """A GroqClient with a mock Groq SDK client."""
    mock_groq = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content="mock Groq response"))
    ]
    mock_groq.chat.completions.create.return_value = mock_response
    client.client = mock_groq
    client._initialized = True
    return client


# ---------------------------------------------------------------------------
# Initialization Tests
# ---------------------------------------------------------------------------

class TestInitialization:

    @patch("app.groq_client.get_settings")
    @patch("app.groq_client.Groq")
    def test_initialize_success(self, mock_groq_cls, mock_settings):
        settings = MagicMock()
        settings.groq_api_key = "test-key"
        settings.groq_model = "llama-3.3-70b-versatile"
        mock_settings.return_value = settings
        mock_groq_cls.return_value = MagicMock()

        c = GroqClient()
        result = c.initialize()
        assert result is True
        assert c.is_configured is True

    @patch("app.groq_client.get_settings")
    def test_initialize_no_key(self, mock_settings):
        settings = MagicMock()
        settings.groq_api_key = ""
        settings.groq_model = "llama-3.3-70b-versatile"
        mock_settings.return_value = settings

        c = GroqClient()
        result = c.initialize()
        assert result is False
        assert c.is_configured is False

    @patch("app.groq_client.get_settings")
    @patch("app.groq_client.Groq")
    def test_initialize_exception(self, mock_groq_cls, mock_settings):
        settings = MagicMock()
        settings.groq_api_key = "test-key"
        settings.groq_model = "llama-3.3-70b-versatile"
        mock_settings.return_value = settings
        mock_groq_cls.side_effect = RuntimeError("SDK error")

        c = GroqClient()
        result = c.initialize()
        assert result is False


# ---------------------------------------------------------------------------
# Sync Generate Tests
# ---------------------------------------------------------------------------

class TestSyncGenerate:

    def test_sync_generate_success(self, configured_client):
        result = configured_client._sync_generate("test prompt")
        assert result == "mock Groq response"

    def test_sync_generate_not_configured(self, client):
        with pytest.raises(RuntimeError, match="not initialized"):
            client._sync_generate("test prompt")

    def test_sync_generate_empty_response(self, configured_client):
        configured_client.client.chat.completions.create.return_value = (
            MagicMock(choices=[])
        )
        with pytest.raises(RuntimeError, match="Empty response"):
            configured_client._sync_generate("test prompt")

    def test_sync_generate_with_system_instruction(self, configured_client):
        result = configured_client._sync_generate(
            "test prompt",
            system_instruction="You are helpful.",
        )
        assert result == "mock Groq response"
        call_args = configured_client.client.chat.completions.create.call_args
        messages = call_args.kwargs.get("messages") or call_args[1].get("messages")
        # First message should be the system instruction
        assert messages[0]["role"] == "system"


# ---------------------------------------------------------------------------
# Async Generate Tests
# ---------------------------------------------------------------------------

class TestAsyncGenerate:

    @pytest.mark.asyncio
    async def test_generate_returns_text_and_latency(self, configured_client):
        text, latency_ms = await configured_client.generate("test prompt")
        assert text == "mock Groq response"
        assert isinstance(latency_ms, int)
        assert latency_ms >= 0


# ---------------------------------------------------------------------------
# Chat QA Tests
# ---------------------------------------------------------------------------

class TestChatQA:

    @pytest.mark.asyncio
    async def test_chat_qa_success(self, configured_client):
        # The mock returns "mock Groq response" which has no MSG-* refs
        result, sources, latency = await configured_client.chat_qa(
            question="What is NLP?",
            context_messages=[
                {"id": "msg-1", "user_name": "Alice", "content": "NLP is great"},
            ],
            papers=[
                {"title": "NLP Survey", "abstract": "A survey of NLP..."},
            ],
        )
        assert isinstance(result, str)
        assert len(result) > 0
        assert isinstance(sources, list)
        assert isinstance(latency, int)

    @pytest.mark.asyncio
    async def test_chat_qa_with_msg_references(self, configured_client):
        configured_client.client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(
                content="As mentioned in MSG-0, NLP is important."
            ))]
        )
        result, sources, latency = await configured_client.chat_qa(
            question="What is NLP?",
            context_messages=[
                {"id": "msg-1", "user_name": "Alice", "content": "NLP is important"},
            ],
            papers=[],
        )
        assert "msg-1" in sources

    @pytest.mark.asyncio
    async def test_chat_qa_error_boundary(self, configured_client):
        """When the LLM raises, chat_qa should return an error string, not crash."""
        configured_client.client.chat.completions.create.side_effect = (
            RuntimeError("API down")
        )
        result, sources, latency = await configured_client.chat_qa(
            question="test",
            context_messages=[],
            papers=[],
        )
        assert "error" in result.lower()
        assert sources == []
        assert latency == 0


# ---------------------------------------------------------------------------
# Session Summarization Tests
# ---------------------------------------------------------------------------

class TestSummarizeSession:

    @pytest.mark.asyncio
    async def test_summarize_empty(self, configured_client):
        summary, points, latency = await configured_client.summarize_session(
            messages=[], session_title="Test"
        )
        assert summary == "No messages to summarize."
        assert points == []
        assert latency == 0

    @pytest.mark.asyncio
    async def test_summarize_success(self, configured_client):
        configured_client.client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(
                content="SUMMARY:\nThis was a productive session.\n\nKEY POINTS:\n- Point 1\n- Point 2"
            ))]
        )
        summary, points, latency = await configured_client.summarize_session(
            messages=[
                {"type": "user", "user_name": "Alice", "content": "Let's discuss NLP"},
            ],
            session_title="NLP Discussion",
        )
        assert "productive" in summary
        assert len(points) == 2

    @pytest.mark.asyncio
    async def test_summarize_error_boundary(self, configured_client):
        """When the LLM raises, summarize_session should return a fallback."""
        configured_client.client.chat.completions.create.side_effect = (
            RuntimeError("timeout")
        )
        summary, points, latency = await configured_client.summarize_session(
            messages=[
                {"type": "user", "user_name": "Bob", "content": "Hello"},
            ],
            session_title="Test",
        )
        assert "Failed" in summary
        assert points == []
        assert latency == 0
