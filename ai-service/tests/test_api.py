"""API contract tests.

The LLM, vector store, and database are stubbed, so these run offline and fast.
What they lock down is the contract the Node server depends on: the @ai gate,
group-id validation, the NDJSON stream shape, and the `sources` payload that
becomes the citation chips in the UI.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.main import app
from app.routers import chat as chat_router
from app.routers import papers as papers_router

GROUP_ID = "af5bb44a-6d71-44da-97d5-0a95f989922b"
USER_ID = "c0462686-25b0-4489-93d2-45b2819b5c1a"

CONTEXT_ITEMS = [
    {
        "id": "vec-1",
        "paper_id": "paper-1",
        "content_type": "paper",
        "chunk_index": 0,
        "content": "The Transformer is based solely on attention mechanisms.",
        "title": "Attention Is All You Need",
        "url": "https://arxiv.org/abs/1706.03762",
        "similarity": 0.912,
    }
]


class FakeLLM:
    is_configured = True
    model_name = "deepseek-chat"

    async def generate(self, **kwargs):
        return "The paper proposes the Transformer.", 42

    async def generate_stream(self, **kwargs):
        for token in ["The ", "Transformer."]:
            yield token


@pytest.fixture
def client(monkeypatch):
    fake_llm = FakeLLM()

    async def fake_context(group_id, query, limit=10, content_types=None):
        return CONTEXT_ITEMS, [item["id"] for item in CONTEXT_ITEMS]

    async def fake_store_artifact(**kwargs):
        return "artifact-1"

    for module in (chat_router, papers_router):
        monkeypatch.setattr(module, "llm_client", fake_llm)
        monkeypatch.setattr(module, "get_group_context", fake_context)
        monkeypatch.setattr(module, "store_ai_artifact", fake_store_artifact)
        monkeypatch.setattr(module, "require_llm", lambda: None)

    # database.is_connected is a read-only property, so patch it on the class:
    # session history is not what these tests are about.
    monkeypatch.setattr(
        type(chat_router.database), "is_connected", property(lambda self: False)
    )

    with TestClient(app) as c:
        yield c


class TestHealth:
    def test_reports_dependency_status(self, client):
        res = client.get("/health")

        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "healthy"
        # Renamed from groq_configured — the server gates AI calls on this field.
        assert "llm_configured" in body


class TestGroupChat:
    def test_answers_and_returns_the_sources_it_was_grounded_in(self, client):
        res = client.post(
            f"/groups/{GROUP_ID}/ai-chat",
            json={"prompt": "@ai what architecture is proposed?", "group_id": GROUP_ID},
        )

        assert res.status_code == 200
        body = res.json()
        assert body["text"] == "The paper proposes the Transformer."

        # The citation payload the client renders as chips.
        assert body["sources"] == [
            {
                "id": "vec-1",
                "type": "paper",
                "title": "Attention Is All You Need",
                "url": "https://arxiv.org/abs/1706.03762",
                "similarity": 0.912,
            }
        ]

    def test_rejects_a_prompt_without_the_ai_trigger(self, client):
        res = client.post(
            f"/groups/{GROUP_ID}/ai-chat",
            json={"prompt": "just chatting with my team", "group_id": GROUP_ID},
        )

        assert res.status_code == 422  # the Pydantic validator refuses it

    def test_rejects_a_malformed_group_id(self, client):
        res = client.post(
            "/groups/not-a-uuid/ai-chat",
            json={"prompt": "@ai hello", "group_id": "not-a-uuid"},
        )

        assert res.status_code == 400

    def test_rejects_a_body_group_id_that_contradicts_the_path(self, client):
        res = client.post(
            f"/groups/{GROUP_ID}/ai-chat",
            json={
                "prompt": "@ai hello",
                "group_id": "00000000-0000-0000-0000-000000000000",
            },
        )

        assert res.status_code == 400

    def test_streams_ndjson_tokens_then_a_done_frame_with_sources(self, client):
        res = client.post(
            f"/groups/{GROUP_ID}/ai-chat/stream",
            json={"prompt": "@ai what architecture?", "group_id": GROUP_ID},
        )

        assert res.status_code == 200
        frames = [json.loads(line) for line in res.text.strip().split("\n")]

        tokens = [f["token"] for f in frames if "token" in f]
        assert "".join(tokens) == "The Transformer."

        done = frames[-1]
        assert done["done"] is True
        assert done["sources"][0]["title"] == "Attention Is All You Need"
        assert done["latency_ms"] >= 0


class TestPaperQA:
    def test_answers_a_question_about_a_paper(self, client):
        res = client.post(
            "/papers/question",
            json={
                "paper_id": "paper-1",
                "question": "@ai what is the contribution?",
                "group_id": GROUP_ID,
                "user_id": USER_ID,
            },
        )

        assert res.status_code == 200
        assert res.json()["answer"] == "The paper proposes the Transformer."

    def test_requires_the_ai_trigger(self, client):
        res = client.post(
            "/papers/question",
            json={
                "paper_id": "paper-1",
                "question": "what is the contribution?",
                "group_id": GROUP_ID,
                "user_id": USER_ID,
            },
        )

        assert res.status_code == 422


class TestHelpers:
    def test_strip_trigger_removes_the_mention_but_keeps_case(self):
        # Case matters to the embedding model (acronyms, proper nouns), so the
        # query must not be lowercased on its way to retrieval.
        assert deps.strip_trigger("@ai What does BERT do?") == "What does BERT do?"
        assert deps.strip_trigger("@AI Explain RAG") == "Explain RAG"

    def test_validate_ai_trigger_rejects_untriggered_text(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            deps.validate_ai_trigger("no mention here")
        assert exc.value.status_code == 400

        assert deps.validate_ai_trigger("@ai hello") == "@ai hello"

    def test_build_chat_prompt_includes_retrieved_context(self):
        prompt = deps.build_chat_prompt(CONTEXT_ITEMS, [], "@ai summarize")

        assert "Retrieved Context" in prompt
        assert "attention mechanisms" in prompt
        assert "@ai summarize" in prompt

    def test_build_chat_prompt_survives_empty_context(self):
        prompt = deps.build_chat_prompt([], [], "@ai hello")

        assert "No context available." in prompt

    def test_build_sources_caps_the_number_of_chips(self):
        many = [dict(CONTEXT_ITEMS[0], id=f"vec-{i}") for i in range(10)]

        assert len(deps.build_sources(many, limit=5)) == 5
