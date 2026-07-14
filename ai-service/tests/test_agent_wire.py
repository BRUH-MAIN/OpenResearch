"""The agent loop against the provider's real wire format.

`test_agent.py` scripts the LLM with a fake object, which proves the loop's
logic but assumes the shape of what a provider returns. That assumption is the
part most likely to be wrong.

So this test mocks DeepSeek at the HTTP layer instead, with a genuine
OpenAI-format tool-call response, and drives the real LangChain client through
it. If `bind_tools` ever stops handing us `{"name", "args", "id"}`, this breaks —
which is exactly when we would want to know.
"""

import json

import httpx
import pytest
import respx

from app import agent as agent_module
from app.agent import ResearchAgent
from app.llm_client import LLMClient

DEEPSEEK_CHAT = "https://api.deepseek.com/v1/chat/completions"


def openai_tool_call_response(tool: str, args: dict) -> dict:
    """What an OpenAI-compatible provider actually sends back for a tool call."""
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 1,
        "model": "deepseek-chat",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_abc123",
                            "type": "function",
                            "function": {
                                "name": tool,
                                "arguments": json.dumps(args),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }


def openai_sse_stream(text: str) -> httpx.Response:
    """The SSE frames a provider sends when `stream: true`.

    The synthesis call streams, so it must be answered in this format — a plain
    JSON body makes LangChain report "no generation chunks", which is precisely
    the wire-level mismatch this file exists to catch.
    """
    frames = [
        {
            "id": "chatcmpl-stream",
            "object": "chat.completion.chunk",
            "created": 1,
            "model": "deepseek-chat",
            "choices": [{"index": 0, "delta": {"content": part}, "finish_reason": None}],
        }
        for part in text.split(" ")
    ]
    body = "".join(f"data: {json.dumps(f)}\n\n" for f in frames)
    body += "data: [DONE]\n\n"
    return httpx.Response(
        200, text=body, headers={"Content-Type": "text/event-stream"}
    )


def openai_text_response(text: str) -> dict:
    return {
        "id": "chatcmpl-2",
        "object": "chat.completion",
        "created": 1,
        "model": "deepseek-chat",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }


@pytest.fixture
def real_llm(monkeypatch):
    """A real LLMClient pointed at DeepSeek — whose HTTP calls respx intercepts."""
    monkeypatch.setattr(
        "app.llm_client.get_settings",
        lambda: type("S", (), {
            "deepseek_api_key": "test-key",
            "deepseek_model": "deepseek-chat",
            "deepseek_base_url": "https://api.deepseek.com/v1",
            "groq_api_key": "",
            "groq_model": "",
            "llm_provider": "deepseek",
        })(),
    )
    client = LLMClient()
    assert client.initialize(), "the real LangChain client should initialize"
    monkeypatch.setattr(agent_module, "llm_client", client)
    return client


@pytest.fixture
def stub_tools(monkeypatch):
    async def fake_context(group_id, query, limit=10, content_types=None):
        return (
            [{
                "id": "vec-1",
                "content": "Self-attention replaces recurrence entirely.",
                "title": "Attention Is All You Need",
                "url": "https://arxiv.org/abs/1706.03762",
                "similarity": 0.9,
            }],
            ["vec-1"],
        )

    monkeypatch.setattr(agent_module, "get_group_context", fake_context)


class TestWireFormat:
    @respx.mock
    async def test_parses_a_real_tool_call_and_dispatches_it(self, real_llm, stub_tools):
        # The loop's calls are non-streaming; the final synthesis streams. The
        # mock has to answer each in the format LangChain expects.
        non_streaming = [
            httpx.Response(
                200,
                json=openai_tool_call_response(
                    "search_group_papers", {"query": "attention"}
                ),
            ),
            httpx.Response(200, json=openai_text_response("I have what I need.")),
        ]

        def respond(request: httpx.Request) -> httpx.Response:
            if json.loads(request.content).get("stream"):
                return openai_sse_stream("Attention replaces recurrence [1].")
            return non_streaming.pop(0)

        route = respx.post(DEEPSEEK_CHAT).mock(side_effect=respond)

        agent = ResearchAgent("af5bb44a-6d71-44da-97d5-0a95f989922b")
        events = [e async for e in agent.run("How does attention work?")]

        # The loop understood the provider's tool_calls and ran the tool.
        steps = [e["step"] for e in events if "step" in e]
        assert steps[0]["tool"] == "search_group_papers"
        assert steps[0]["args"] == {"query": "attention"}

        # The tool's output became numbered evidence.
        assert agent.evidence[0]["n"] == 1
        assert agent.evidence[0]["title"] == "Attention Is All You Need"

        # And the tool result was sent back to the model as a tool message.
        second_request = json.loads(route.calls[1].request.content)
        roles = [m["role"] for m in second_request["messages"]]
        assert "tool" in roles

        done = [e for e in events if e.get("done")][0]
        assert done["sources"][0]["title"] == "Attention Is All You Need"

    @respx.mock
    async def test_sends_the_tool_schemas_the_provider_expects(self, real_llm, stub_tools):
        def respond(request: httpx.Request) -> httpx.Response:
            if json.loads(request.content).get("stream"):
                return openai_sse_stream("No tools needed.")
            return httpx.Response(200, json=openai_text_response("No tools needed."))

        route = respx.post(DEEPSEEK_CHAT).mock(side_effect=respond)

        agent = ResearchAgent("af5bb44a-6d71-44da-97d5-0a95f989922b")
        [e async for e in agent.run("hello")]

        payload = json.loads(route.calls[0].request.content)
        tool_names = {t["function"]["name"] for t in payload["tools"]}

        assert tool_names == {"search_group_papers", "search_arxiv", "read_paper"}
        # The schema must be the function-calling shape, not something bespoke.
        assert payload["tools"][0]["type"] == "function"
        assert "parameters" in payload["tools"][0]["function"]
