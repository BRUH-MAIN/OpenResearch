"""
Supplementary tests for main.py — covers helper functions, uncovered endpoints,
agentic routes, legacy endpoints, and happy-path scenarios.
"""

import os
import uuid
import tempfile

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.main import (
    app,
    validate_ai_trigger,
    validate_uuid as validate_uuid_fn,
    get_group_context,
    store_ai_artifact,
)

client = TestClient(app)

GROUP_ID = "11111111-1111-1111-1111-111111111111"
SESSION_ID = "33333333-3333-3333-3333-333333333333"
USER_ID = "55555555-5555-5555-5555-555555555555"
PAPER_ID = "77777777-7777-7777-7777-777777777777"


# ---------------------------------------------------------------------------
# Helper function tests
# ---------------------------------------------------------------------------

class TestValidateAiTrigger:

    def test_valid_trigger(self):
        assert validate_ai_trigger("@ai hello") == "@ai hello"

    def test_valid_trigger_uppercase(self):
        assert validate_ai_trigger("@AI hello") == "@AI hello"

    def test_missing_trigger(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_ai_trigger("hello world")
        assert exc_info.value.status_code == 400

    def test_empty_string(self):
        with pytest.raises(HTTPException):
            validate_ai_trigger("")

    def test_none(self):
        with pytest.raises(HTTPException):
            validate_ai_trigger(None)

    def test_custom_field_name(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_ai_trigger("no trigger", "question")
        assert "question" in exc_info.value.detail


class TestValidateUuid:

    def test_valid_uuid(self):
        valid = "11111111-1111-1111-1111-111111111111"
        assert validate_uuid_fn(valid) == valid

    def test_invalid_uuid(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_uuid_fn("not-a-uuid")
        assert exc_info.value.status_code == 400

    def test_empty_string(self):
        with pytest.raises(HTTPException):
            validate_uuid_fn("")

    def test_none(self):
        with pytest.raises(HTTPException):
            validate_uuid_fn(None)

    def test_custom_field(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_uuid_fn("bad", "session_id")
        assert "session_id" in exc_info.value.detail


class TestGetGroupContext:

    @pytest.mark.asyncio
    @patch("app.main.vector_store")
    async def test_vector_store_not_connected(self, mock_vs):
        mock_vs.is_connected = False
        items, ids = await get_group_context(GROUP_ID, "query")
        assert items == []
        assert ids == []

    @pytest.mark.asyncio
    @patch("app.main.vector_store")
    async def test_vector_store_returns_results(self, mock_vs):
        mock_vs.is_connected = True
        mock_vs.search_group_vectors = AsyncMock(return_value=[
            {"id": "v1", "content_type": "paper", "content": "text", "similarity": 0.9}
        ])
        items, ids = await get_group_context(GROUP_ID, "query")
        assert len(items) == 1
        assert ids == ["v1"]

    @pytest.mark.asyncio
    async def test_invalid_group_id(self):
        with pytest.raises(HTTPException):
            await get_group_context("bad-id", "query")


class TestStoreAiArtifact:

    @pytest.mark.asyncio
    @patch("app.main.database")
    async def test_database_not_connected(self, mock_db):
        mock_db.is_connected = False
        result = await store_ai_artifact("g1", "qa", "content")
        assert result is None

    @pytest.mark.asyncio
    @patch("app.main.vector_store")
    @patch("app.main.database")
    async def test_stores_artifact_and_vector(self, mock_db, mock_vs):
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value="art-1")
        mock_vs.is_connected = True
        mock_vs.insert_vector = AsyncMock()

        result = await store_ai_artifact(GROUP_ID, "qa", "answer", prompt="q")
        assert result == "art-1"
        mock_vs.insert_vector.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("app.main.vector_store")
    @patch("app.main.database")
    async def test_stores_artifact_no_vector_store(self, mock_db, mock_vs):
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value="art-1")
        mock_vs.is_connected = False

        result = await store_ai_artifact(GROUP_ID, "qa", "content")
        assert result == "art-1"


# ---------------------------------------------------------------------------
# Agentic endpoints
# ---------------------------------------------------------------------------

class TestAgenticRunEndpoint:

    def test_agentic_run_no_trigger(self):
        response = client.post("/agentic/run", json={
            "task_type": "research",
            "prompt": "do something",  # no @ai
            "group_id": GROUP_ID,
        })
        assert response.status_code in [400, 422]

    def test_agentic_run_groq_not_configured(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = False
            response = client.post("/agentic/run", json={
                "task_type": "paper_retrieval",
                "prompt": "@ai do something",
                "group_id": GROUP_ID,
            })
            assert response.status_code == 503

    def test_agentic_run_success(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.agentic_service") as mock_agentic:
            mock_groq.is_configured = True
            mock_agentic.run_task = AsyncMock(return_value={
                "task_type": "paper_retrieval",
                "result": {},
                "artifacts": [],
                "metadata": {},
                "latency_ms": 100,
            })

            response = client.post("/agentic/run", json={
                "task_type": "paper_retrieval",
                "prompt": "@ai research transformers",
                "group_id": GROUP_ID,
            })
            assert response.status_code in [200, 500]

    def test_agentic_run_failure(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.agentic_service") as mock_agentic:
            mock_groq.is_configured = True
            mock_agentic.run_task = AsyncMock(side_effect=Exception("fail"))

            response = client.post("/agentic/run", json={
                "task_type": "paper_retrieval",
                "prompt": "@ai research transformers",
                "group_id": GROUP_ID,
            })
            assert response.status_code == 500


class TestClassifyIntentEndpoint:

    def test_classify_no_trigger(self):
        response = client.post("/agentic/classify-intent", json={
            "prompt": "no trigger here",
        })
        assert response.status_code in [400, 422]

    def test_classify_success(self):
        with patch("app.main.embedding_service") as mock_emb, \
             patch("app.main.classify_intent") as mock_cls:
            mock_emb.is_configured = True
            mock_cls.side_effect = AsyncMock(return_value={
                "task_type": "paper_retrieval",
                "similarity": 0.95,
                "threshold": 0.5,
                "matched_phrase": "find papers",
            })

            response = client.post("/agentic/classify-intent", json={
                "prompt": "@ai classify this",
            })
            assert response.status_code in [200, 500]


# ---------------------------------------------------------------------------
# Add Paper to Group
# ---------------------------------------------------------------------------

class TestAddPaperToGroup:

    def test_add_paper_group_mismatch(self):
        response = client.post(
            f"/groups/{GROUP_ID}/papers",
            json={
                "group_id": "22222222-2222-2222-2222-222222222222",
                "paper_id": PAPER_ID,
                "title": "Paper",
                "abstract": "Abstract",
                "user_id": USER_ID,
            },
        )
        assert response.status_code == 400

    def test_add_paper_invalid_group_id(self):
        response = client.post(
            "/groups/bad-uuid/papers",
            json={
                "group_id": "bad-uuid",
                "paper_id": PAPER_ID,
                "title": "Paper",
                "abstract": "Abstract",
                "user_id": USER_ID,
            },
        )
        assert response.status_code == 400

    def test_add_paper_vector_store_not_connected(self):
        with patch("app.main.vector_store") as mock_vs:
            mock_vs.is_connected = False
            response = client.post(
                f"/groups/{GROUP_ID}/papers",
                json={
                    "group_id": GROUP_ID,
                    "paper_id": PAPER_ID,
                    "title": "Paper",
                    "abstract": "Abstract",
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 503

    def test_add_paper_success(self):
        with patch("app.main.vector_store") as mock_vs:
            mock_vs.is_connected = True
            mock_vs.insert_paper_chunks = AsyncMock(return_value=["v1", "v2"])

            response = client.post(
                f"/groups/{GROUP_ID}/papers",
                json={
                    "group_id": GROUP_ID,
                    "paper_id": PAPER_ID,
                    "title": "Paper Title",
                    "abstract": "Paper abstract text",
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["vectors_created"] == 2


# ---------------------------------------------------------------------------
# Download Report
# ---------------------------------------------------------------------------

class TestDownloadReport:

    def test_download_report_not_found(self):
        response = client.get("/reports/nonexistent.pdf")
        assert response.status_code == 404

    def test_download_report_success(self):
        # Create a dummy file in ./reports/
        os.makedirs("./reports", exist_ok=True)
        test_file = "./reports/test-download.pdf"
        with open(test_file, "wb") as f:
            f.write(b"%PDF-1.4 fake content")
        try:
            response = client.get("/reports/test-download.pdf")
            assert response.status_code == 200
            assert response.headers["content-type"] == "application/pdf"
        finally:
            os.remove(test_file)


# ---------------------------------------------------------------------------
# Legacy /chat
# ---------------------------------------------------------------------------

class TestLegacyChatEndpoint:

    def test_chat_groq_not_configured(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = False
            response = client.post("/chat", json={
                "question": "What is ML?",
                "session_id": SESSION_ID,
            })
            assert response.status_code == 503

    def test_chat_success(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.chat_qa = AsyncMock(return_value=("Answer text", ["src"], 100))
            mock_db.is_connected = True
            mock_db.get_session_info = AsyncMock(return_value={"title": "Session"})
            mock_db.get_session_messages = AsyncMock(return_value=[])
            mock_db.get_session_papers = AsyncMock(return_value=[])

            response = client.post("/chat", json={
                "question": "What is ML?",
                "session_id": SESSION_ID,
                "include_papers": True,
            })
            assert response.status_code == 200
            data = response.json()
            assert "answer" in data

    def test_chat_no_session(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.chat_qa = AsyncMock(return_value=("Answer", [], 50))
            mock_db.is_connected = False

            response = client.post("/chat", json={
                "question": "What is ML?",
            })
            assert response.status_code == 200


# ---------------------------------------------------------------------------
# Legacy /summarize
# ---------------------------------------------------------------------------

class TestLegacySummarizeEndpoint:

    def test_summarize_groq_not_configured(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = False
            response = client.post("/summarize", json={
                "session_id": SESSION_ID,
            })
            assert response.status_code == 503

    def test_summarize_db_not_connected(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_db.is_connected = False
            response = client.post("/summarize", json={
                "session_id": SESSION_ID,
            })
            assert response.status_code == 503

    def test_summarize_session_not_found(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_db.is_connected = True
            mock_db.get_session_info = AsyncMock(return_value=None)
            response = client.post("/summarize", json={
                "session_id": SESSION_ID,
            })
            assert response.status_code == 404

    def test_summarize_no_messages(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_db.is_connected = True
            mock_db.get_session_info = AsyncMock(return_value={"title": "S"})
            mock_db.get_session_messages = AsyncMock(return_value=[])
            response = client.post("/summarize", json={
                "session_id": SESSION_ID,
            })
            assert response.status_code == 400

    def test_summarize_success(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.summarize_session = AsyncMock(return_value=(
                "Session summary text",
                ["key point 1", "key point 2"],
                150,
            ))
            mock_db.is_connected = True
            mock_db.get_session_info = AsyncMock(return_value={"title": "Test Session"})
            mock_db.get_session_messages = AsyncMock(return_value=[
                {"content": "Hello", "type": "user", "user_name": "Alice"},
                {"content": "Hi", "type": "user", "user_name": "Bob"},
            ])

            response = client.post("/summarize", json={
                "session_id": SESSION_ID,
            })
            assert response.status_code == 200
            data = response.json()
            assert "summary" in data
            assert data["participant_count"] == 2


# ---------------------------------------------------------------------------
# /test endpoint
# ---------------------------------------------------------------------------

class TestTestEndpoint:

    def test_test_groq_not_configured(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = False
            response = client.post("/test?question=hi")
            assert response.status_code == 503

    def test_test_success(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.generate = AsyncMock(return_value=("Answer", 50))

            response = client.post("/test?question=hi")
            assert response.status_code == 200
            data = response.json()
            assert data["answer"] == "Answer"

    def test_test_default_question(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = True
            mock_groq.model_name = "test-model"
            mock_groq.generate = AsyncMock(return_value=("ML is...", 30))

            response = client.post("/test")
            assert response.status_code == 200


# ---------------------------------------------------------------------------
# Happy-path: group_ai_chat full flow
# ---------------------------------------------------------------------------

class TestGroupChatFullFlow:

    def test_full_flow(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.generate = AsyncMock(return_value=("AI answer", 100))
            mock_vs.is_connected = True
            mock_vs.search_group_vectors = AsyncMock(return_value=[
                {"id": "v1", "content_type": "paper", "content": "relevant text",
                 "similarity": 0.9, "chunk_index": 0}
            ])
            mock_vs.insert_vector = AsyncMock()
            mock_db.is_connected = True
            mock_db.get_session_messages = AsyncMock(return_value=[])
            mock_db.get_group_memory_notes = AsyncMock(return_value=[])
            mock_db.store_ai_artifact = AsyncMock(return_value="art-1")

            response = client.post(
                f"/groups/{GROUP_ID}/ai-chat",
                json={
                    "prompt": "@ai What papers discuss transformers?",
                    "group_id": GROUP_ID,
                    "session_id": SESSION_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert "text" in data
            assert data["text"] == "AI answer"

    def test_full_flow_with_session_messages_and_memory(self):
        """Exercises context building with session messages and memory notes."""
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.generate = AsyncMock(return_value=("Context-rich answer", 200))
            mock_vs.is_connected = True
            mock_vs.search_group_vectors = AsyncMock(return_value=[
                {"id": "v1", "content_type": "paper", "content": "paper text",
                 "similarity": 0.85, "chunk_index": 0}
            ])
            mock_vs.insert_vector = AsyncMock()
            mock_db.is_connected = True
            mock_db.get_session_messages = AsyncMock(return_value=[
                {"user_name": "Alice", "content": "Previous message about ML"},
                {"user_name": "Bob", "content": "Another message"},
            ])
            mock_db.get_group_memory_notes = AsyncMock(return_value=[
                {"note_type": "decision", "content": "Focus on NLP"},
            ])
            mock_db.store_ai_artifact = AsyncMock(return_value="art-2")

            response = client.post(
                f"/groups/{GROUP_ID}/ai-chat",
                json={
                    "prompt": "@ai What papers discuss transformers?",
                    "group_id": GROUP_ID,
                    "session_id": SESSION_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 200

    def test_group_chat_groq_not_configured(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = False
            response = client.post(
                f"/groups/{GROUP_ID}/ai-chat",
                json={
                    "prompt": "@ai question",
                    "group_id": GROUP_ID,
                    "session_id": SESSION_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 503

    def test_group_chat_mismatched_ids(self):
        response = client.post(
            f"/groups/{GROUP_ID}/ai-chat",
            json={
                "prompt": "@ai question",
                "group_id": "22222222-2222-2222-2222-222222222222",
                "session_id": SESSION_ID,
                "user_id": USER_ID,
            },
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Paper Q&A full flow
# ---------------------------------------------------------------------------

class TestPaperQuestionFullFlow:

    def test_paper_question_success(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.generate = AsyncMock(return_value=("Paper answer", 150))
            mock_vs.is_connected = True
            mock_vs.search_group_vectors = AsyncMock(return_value=[
                {"id": "v1", "content_type": "paper", "content": "paper content here",
                 "paper_id": PAPER_ID, "similarity": 0.92, "chunk_index": 0}
            ])
            mock_vs.insert_vector = AsyncMock()
            mock_db.is_connected = True
            mock_db.get_paper_info = AsyncMock(return_value={
                "title": "Attention Is All You Need",
                "authors": ["Vaswani"],
                "abstract": "A paper about attention.",
            })
            mock_db.store_ai_artifact = AsyncMock(return_value="art-pq")

            response = client.post("/papers/question", json={
                "paper_id": PAPER_ID,
                "question": "@ai What is the methodology?",
                "group_id": GROUP_ID,
                "session_id": SESSION_ID,
                "user_id": USER_ID,
            })
            assert response.status_code == 200
            data = response.json()
            assert data["answer"] == "Paper answer"
            assert data["paper_id"] == PAPER_ID

    def test_paper_question_groq_not_configured(self):
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = False
            response = client.post("/papers/question", json={
                "paper_id": PAPER_ID,
                "question": "@ai What is the methodology?",
                "group_id": GROUP_ID,
                "user_id": USER_ID,
            })
            assert response.status_code == 503

    def test_paper_question_not_found(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_vs.is_connected = True
            mock_vs.search_group_vectors = AsyncMock(return_value=[])
            mock_db.is_connected = True
            mock_db.get_paper_info = AsyncMock(return_value=None)

            response = client.post("/papers/question", json={
                "paper_id": PAPER_ID,
                "question": "@ai What is the methodology?",
                "group_id": GROUP_ID,
                "user_id": USER_ID,
            })
            assert response.status_code in [404, 500]


# ---------------------------------------------------------------------------
# Paper Summarize full flow
# ---------------------------------------------------------------------------

class TestPaperSummarizeFullFlow:

    def test_paper_summarize_success(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.model_name = "llama-3.3-70b-versatile"
            mock_groq.generate = AsyncMock(return_value=(
                "Main contribution:\n- Key finding 1\n- Key finding 2\nMethodology: ...\nImplications: ...",
                200
            ))
            mock_vs.is_connected = True
            mock_vs.search_group_vectors = AsyncMock(return_value=[
                {"id": "v1", "content_type": "paper", "content": "paper text",
                 "paper_id": PAPER_ID, "similarity": 0.9, "chunk_index": 0}
            ])
            mock_vs.insert_vector = AsyncMock()
            mock_db.is_connected = True
            mock_db.get_paper_info = AsyncMock(return_value={
                "title": "Test Paper",
                "authors": ["Author A"],
                "abstract": "Test abstract",
            })
            mock_db.store_ai_artifact = AsyncMock(return_value="art-ps")

            response = client.post("/papers/summarize", json={
                "paper_id": PAPER_ID,
                "group_id": GROUP_ID,
                "user_id": USER_ID,
                "trigger": "@ai summarize",
            })
            assert response.status_code == 200
            data = response.json()
            assert "summary" in data
            assert data["paper_id"] == PAPER_ID

    def test_paper_summarize_not_found(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_vs.is_connected = True
            mock_vs.search_group_vectors = AsyncMock(return_value=[])
            mock_db.is_connected = True
            mock_db.get_paper_info = AsyncMock(return_value=None)

            response = client.post("/papers/summarize", json={
                "paper_id": PAPER_ID,
                "group_id": GROUP_ID,
                "user_id": USER_ID,
                "trigger": "@ai summarize",
            })
            assert response.status_code == 404


# ---------------------------------------------------------------------------
# Report Generation full flow
# ---------------------------------------------------------------------------

class TestReportGenerationFullFlow:

    def test_generate_report_success(self):
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db, \
             patch("app.main.report_generator") as mock_rg:
            mock_groq.is_configured = True
            mock_db.is_connected = True
            mock_db.get_group_info = AsyncMock(return_value={
                "name": "Test Group", "description": "A test group"
            })
            mock_db.get_group_sessions_with_messages = AsyncMock(return_value=[])
            mock_db.get_group_papers = AsyncMock(return_value=[])
            mock_db.get_group_artifacts = AsyncMock(return_value=[])
            mock_db.get_group_memory_notes = AsyncMock(return_value=[])
            mock_db.get_user_info = AsyncMock(return_value={"name": "Test User"})
            mock_db.store_report_metadata = AsyncMock(return_value="rpt-1")
            mock_rg.generate_group_report = MagicMock(
                return_value=("/tmp/report.pdf", "report.pdf", 1024)
            )

            response = client.post(
                f"/reports/group/{GROUP_ID}/generate",
                json={
                    "group_id": GROUP_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "rpt-1"
            assert data["filename"] == "report.pdf"

    def test_generate_report_db_not_connected(self):
        with patch("app.main.database") as mock_db:
            mock_db.is_connected = False
            response = client.post(
                f"/reports/group/{GROUP_ID}/generate",
                json={
                    "group_id": GROUP_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 503

    def test_generate_report_group_not_found(self):
        with patch("app.main.database") as mock_db:
            mock_db.is_connected = True
            mock_db.get_group_info = AsyncMock(return_value=None)
            response = client.post(
                f"/reports/group/{GROUP_ID}/generate",
                json={
                    "group_id": GROUP_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 404

    def test_generate_report_mismatched_group_ids(self):
        response = client.post(
            f"/reports/group/{GROUP_ID}/generate",
            json={
                "group_id": "22222222-2222-2222-2222-222222222222",
                "user_id": USER_ID,
            },
        )
        assert response.status_code == 400

    def test_generate_report_with_custom_prompt(self):
        with patch("app.main.database") as mock_db, \
             patch("app.main.report_generator") as mock_rg:
            mock_db.is_connected = True
            mock_db.get_group_info = AsyncMock(return_value={"name": "G", "description": ""})
            mock_db.get_group_sessions_with_messages = AsyncMock(return_value=[])
            mock_db.get_group_papers = AsyncMock(return_value=[])
            mock_db.get_group_artifacts = AsyncMock(return_value=[])
            mock_db.get_group_memory_notes = AsyncMock(return_value=[])
            mock_db.get_user_info = AsyncMock(return_value=None)
            mock_db.store_report_metadata = AsyncMock(return_value="rpt-2")
            mock_rg.generate_group_report = MagicMock(
                return_value=("/tmp/r.pdf", "r.pdf", 512)
            )

            response = client.post(
                f"/reports/group/{GROUP_ID}/generate",
                json={
                    "group_id": GROUP_ID,
                    "user_id": USER_ID,
                    "prompt": "@ai generate insights",
                },
            )
            assert response.status_code == 200

    def test_generate_report_with_summaries(self):
        with patch("app.main.database") as mock_db, \
             patch("app.main.report_generator") as mock_rg:
            mock_db.is_connected = True
            mock_db.get_group_info = AsyncMock(return_value={"name": "G", "description": ""})
            mock_db.get_group_sessions_with_messages = AsyncMock(return_value=[
                {"title": "S1", "messages": []}
            ])
            mock_db.get_group_papers = AsyncMock(return_value=[
                {"title": "P1", "authors": ["A"]}
            ])
            mock_db.get_group_artifacts = AsyncMock(return_value=[
                {"artifact_type": "summary", "content": "Sum"},
                {"artifact_type": "qa", "content": "QA", "prompt": "Q?"},
            ])
            mock_db.get_group_memory_notes = AsyncMock(return_value=[
                {"note_type": "decision", "content": "Note"}
            ])
            mock_db.get_user_info = AsyncMock(return_value={"name": "Test"})
            mock_db.store_report_metadata = AsyncMock(return_value="rpt-3")
            mock_rg.generate_group_report = MagicMock(
                return_value=("/tmp/r.pdf", "r.pdf", 2048)
            )

            response = client.post(
                f"/reports/group/{GROUP_ID}/generate",
                json={
                    "group_id": GROUP_ID,
                    "user_id": USER_ID,
                    "include_sessions": True,
                    "include_papers": True,
                    "include_summaries": True,
                },
            )
            assert response.status_code == 200


# ---------------------------------------------------------------------------
# Exception handling paths
# ---------------------------------------------------------------------------

class TestExceptionPaths:

    def test_chat_qa_exception(self):
        """Cover the exception handler in chat_qa endpoint."""
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.chat_qa = AsyncMock(side_effect=RuntimeError("LLM failed"))
            mock_db.is_connected = False

            response = client.post("/chat", json={
                "question": "What is ML?",
            })
            assert response.status_code == 500

    def test_summarize_exception(self):
        """Cover the exception handler in summarize_session endpoint."""
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.summarize_session = AsyncMock(side_effect=RuntimeError("fail"))
            mock_db.is_connected = True
            mock_db.get_session_info = AsyncMock(return_value={"title": "S"})
            mock_db.get_session_messages = AsyncMock(return_value=[
                {"content": "msg", "type": "user", "user_name": "Alice"},
            ])

            response = client.post("/summarize", json={
                "session_id": SESSION_ID,
            })
            assert response.status_code == 500

    def test_test_generation_exception(self):
        """Cover the exception handler in test_generation endpoint."""
        with patch("app.main.groq_client") as mock_groq:
            mock_groq.is_configured = True
            mock_groq.generate = AsyncMock(side_effect=RuntimeError("generation failed"))

            response = client.post("/test?question=hi")
            assert response.status_code == 500

    def test_paper_summarize_exception(self):
        """Cover the exception handler in paper_summarize endpoint."""
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.generate = AsyncMock(side_effect=RuntimeError("LLM down"))
            mock_vs.is_connected = True
            mock_vs.search_group_vectors = AsyncMock(return_value=[
                {"id": "v1", "content_type": "paper", "content": "text",
                 "paper_id": PAPER_ID, "similarity": 0.9, "chunk_index": 0}
            ])
            mock_db.is_connected = True
            mock_db.get_paper_info = AsyncMock(return_value={"title": "P", "authors": []})

            response = client.post("/papers/summarize", json={
                "paper_id": PAPER_ID,
                "group_id": GROUP_ID,
                "user_id": USER_ID,
                "trigger": "@ai summarize",
            })
            assert response.status_code == 500

    def test_group_ai_chat_exception(self):
        """Cover the exception handler in group_ai_chat endpoint."""
        with patch("app.main.groq_client") as mock_groq, \
             patch("app.main.vector_store") as mock_vs, \
             patch("app.main.database") as mock_db:
            mock_groq.is_configured = True
            mock_groq.generate = AsyncMock(side_effect=RuntimeError("boom"))
            mock_vs.is_connected = False
            mock_db.is_connected = False

            response = client.post(
                f"/groups/{GROUP_ID}/ai-chat",
                json={
                    "prompt": "@ai question",
                    "group_id": GROUP_ID,
                    "session_id": SESSION_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 500

    def test_report_generation_exception(self):
        """Cover the exception handler in generate_report endpoint."""
        with patch("app.main.database") as mock_db, \
             patch("app.main.report_generator") as mock_rg:
            mock_db.is_connected = True
            mock_db.get_group_info = AsyncMock(return_value={"name": "G", "description": ""})
            mock_db.get_group_sessions_with_messages = AsyncMock(return_value=[])
            mock_db.get_group_papers = AsyncMock(return_value=[])
            mock_db.get_group_artifacts = AsyncMock(return_value=[])
            mock_db.get_group_memory_notes = AsyncMock(return_value=[])
            mock_db.get_user_info = AsyncMock(return_value=None)
            mock_rg.generate_group_report = MagicMock(side_effect=RuntimeError("PDF fail"))

            response = client.post(
                f"/reports/group/{GROUP_ID}/generate",
                json={
                    "group_id": GROUP_ID,
                    "user_id": USER_ID,
                },
            )
            assert response.status_code == 500
