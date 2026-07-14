"""The research agent's ReAct loop.

The LLM is a scripted fake, so the loop's own behaviour is what is under test:
does it call the tool the model asked for, feed the observation back, stop when
the model stops asking, refuse to repeat itself, and respect the iteration cap?

None of these tests touch a real model or a real network.
"""

import pytest

from app import agent as agent_module
from app.agent import MAX_ITERATIONS, ResearchAgent


class FakeToolCall(dict):
    """LangChain surfaces tool calls as dicts with name/args/id."""


class FakeResponse:
    def __init__(self, tool_calls=None, content=""):
        self.tool_calls = tool_calls or []
        self.content = content


class ScriptedLLM:
    """Returns a queued response per invocation, and records what it was asked."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def bind_tools(self, tools):
        self.tools = tools
        return self

    async def ainvoke(self, messages):
        self.calls.append(messages)
        if not self.script:
            return FakeResponse(content="done")
        return self.script.pop(0)


@pytest.fixture
def wire(monkeypatch):
    """Wire a scripted LLM and stubbed tools into the agent module."""

    def _wire(script, group_chunks=None, arxiv_papers=None, papers=None):
        llm = ScriptedLLM(script)
        monkeypatch.setattr(agent_module.llm_client, "bind_tools", llm.bind_tools)

        async def fake_stream(**kwargs):
            for token in ["Synthesized ", "answer."]:
                yield token

        monkeypatch.setattr(agent_module.llm_client, "generate_stream", fake_stream)

        async def fake_context(group_id, query, limit=10, content_types=None):
            chunks = group_chunks if group_chunks is not None else []
            return chunks, [c["id"] for c in chunks]

        monkeypatch.setattr(agent_module, "get_group_context", fake_context)

        async def fake_arxiv(query, max_results=5):
            return arxiv_papers or []

        monkeypatch.setattr(agent_module, "search_arxiv", fake_arxiv)

        async def fake_group_papers(self, group_id):
            return papers or []

        monkeypatch.setattr(
            type(agent_module.database), "get_group_papers", fake_group_papers
        )
        monkeypatch.setattr(
            type(agent_module.database), "is_connected", property(lambda self: True)
        )
        return llm

    return _wire


def tool_call(name, args, call_id="call-1"):
    return {"name": name, "args": args, "id": call_id}


CHUNK = {
    "id": "vec-1",
    "content": "The Transformer relies entirely on self-attention.",
    "title": "Attention Is All You Need",
    "url": "https://arxiv.org/abs/1706.03762",
    "similarity": 0.91,
}


async def collect(agent, question="What architecture is proposed?"):
    return [event async for event in agent.run(question)]


class TestLoop:
    async def test_calls_the_tool_the_model_asks_for_and_stops_when_it_stops(self, wire):
        wire(
            script=[
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": "architecture"})]),
                FakeResponse(content="I have enough."),  # no tool calls -> stop
            ],
            group_chunks=[CHUNK],
        )

        events = await collect(ResearchAgent("g1"))

        steps = [e["step"] for e in events if "step" in e]
        assert steps[0]["tool"] == "search_group_papers"
        assert steps[-1]["tool"] == "synthesize"

        observations = [e["observation"] for e in events if "observation" in e]
        assert observations[0]["sources_so_far"] == 1

    async def test_feeds_the_observation_back_so_the_model_can_act_on_it(self, wire):
        # The model searches the group, sees nothing, and goes to arXiv — the
        # behaviour single-shot RAG structurally cannot produce.
        llm = wire(
            script=[
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": "diffusion"})]),
                FakeResponse(tool_calls=[tool_call("search_arxiv", {"query": "diffusion"}, "call-2")]),
                FakeResponse(content="Answering now."),
            ],
            group_chunks=[],  # the team has nothing on this
            arxiv_papers=[
                {
                    "title": "Denoising Diffusion Probabilistic Models",
                    "authors": ["Ho"],
                    "abstract": "We present high quality image synthesis.",
                    "url": "https://arxiv.org/abs/2006.11239",
                    "published": "2020-06-19",
                }
            ],
        )

        events = await collect(ResearchAgent("g1"))

        tools_used = [e["step"]["tool"] for e in events if "step" in e]
        assert tools_used == ["search_group_papers", "search_arxiv", "synthesize"]

        # The empty result was fed back to the model as a tool message.
        second_prompt = llm.calls[1]
        assert any("No matching passages" in str(m.content) for m in second_prompt)

    async def test_refuses_to_repeat_an_identical_call(self, wire):
        llm = wire(
            script=[
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": "same"})]),
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": "same"}, "call-2")]),
                FakeResponse(content="Fine, answering."),
            ],
            group_chunks=[CHUNK],
        )

        events = await collect(ResearchAgent("g1"))

        # The duplicate is not executed — only one real search step is emitted.
        searches = [
            e for e in events
            if "step" in e and e["step"]["tool"] == "search_group_papers"
        ]
        assert len(searches) == 1

        # And the model is told why, so it can change course.
        third_prompt = llm.calls[2]
        assert any("already ran this exact search" in str(m.content) for m in third_prompt)

    async def test_stops_at_the_iteration_cap(self, wire):
        # A model that never stops asking. Without a cap this burns the rate limit.
        wire(
            script=[
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": f"q{i}"}, f"c{i}")])
                for i in range(MAX_ITERATIONS + 5)
            ],
            group_chunks=[CHUNK],
        )

        events = await collect(ResearchAgent("g1"))

        done = [e for e in events if e.get("done")][0]
        assert done["iterations"] == MAX_ITERATIONS

        capped = [
            e for e in events
            if "observation" in e and "limit" in e["observation"]["summary"]
        ]
        assert capped, "the agent should say it stopped because it hit the cap"

    async def test_survives_a_tool_that_throws(self, wire, monkeypatch):
        wire(
            script=[
                FakeResponse(tool_calls=[tool_call("search_arxiv", {"query": "x"})]),
                FakeResponse(content="Answering despite the failure."),
            ],
        )

        async def exploding_arxiv(query, max_results=5):
            raise RuntimeError("arXiv is down")

        monkeypatch.setattr(agent_module, "search_arxiv", exploding_arxiv)

        events = await collect(ResearchAgent("g1"))

        # It reports the failure and still produces an answer.
        observations = [e["observation"]["summary"] for e in events if "observation" in e]
        assert any("failed" in o for o in observations)
        assert any(e.get("done") for e in events)


class TestCitations:
    async def test_numbers_sources_and_returns_them_for_the_ui(self, wire):
        wire(
            script=[
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": "x"})]),
                FakeResponse(content="Done."),
            ],
            group_chunks=[CHUNK],
        )

        events = await collect(ResearchAgent("g1"))
        done = [e for e in events if e.get("done")][0]

        assert done["sources"] == [
            {
                "id": "agent-1",
                "type": "group",
                "title": "Attention Is All You Need",
                "url": "https://arxiv.org/abs/1706.03762",
                "similarity": 0.91,
            }
        ]

    async def test_the_same_passage_keeps_its_citation_number(self, wire):
        wire(
            script=[
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": "a"})]),
                FakeResponse(tool_calls=[tool_call("search_group_papers", {"query": "b"}, "c2")]),
                FakeResponse(content="Done."),
            ],
            group_chunks=[CHUNK],  # both searches return the same chunk
        )

        agent = ResearchAgent("g1")
        events = await collect(agent)
        done = [e for e in events if e.get("done")][0]

        # Cited once, as [1] — not twice under two different numbers.
        assert len(done["sources"]) == 1
        assert agent.evidence[0]["n"] == 1

    async def test_streams_the_synthesis_as_tokens(self, wire):
        wire(script=[FakeResponse(content="No tools needed.")])

        events = await collect(ResearchAgent("g1"))

        tokens = "".join(e["token"] for e in events if "token" in e)
        assert tokens == "Synthesized answer."


class TestReadPaper:
    async def test_reads_the_full_text_of_an_uploaded_paper(self, wire):
        wire(
            script=[
                FakeResponse(tool_calls=[tool_call("read_paper", {"title": "Attention Is All You Need"})]),
                FakeResponse(content="Done."),
            ],
            papers=[
                {
                    "title": "Attention Is All You Need",
                    "url": "https://arxiv.org/abs/1706.03762",
                    "full_text": "Section 3.2 describes scaled dot-product attention in detail.",
                }
            ],
        )

        agent = ResearchAgent("g1")
        await collect(agent)

        assert "scaled dot-product" in agent.evidence[0]["content"]

    async def test_says_so_when_the_paper_is_not_in_the_group(self, wire):
        wire(
            script=[
                FakeResponse(tool_calls=[tool_call("read_paper", {"title": "Nonexistent"})]),
                FakeResponse(content="Done."),
            ],
            papers=[{"title": "Something Else", "url": "", "full_text": "text"}],
        )

        events = await collect(ResearchAgent("g1"))

        observation = [e["observation"] for e in events if "observation" in e][0]
        assert "No such paper" in observation["summary"]
