"""Tests for the agentic orchestration service."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from tenacity import RetryError

from app.agentic import AgenticService, AgentState


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def service():
    """Return a fresh AgenticService (not initialized)."""
    return AgenticService()


@pytest.fixture
def mock_llm():
    """Mock ChatGroq that returns a predictable content string."""
    llm = AsyncMock()
    llm.ainvoke = AsyncMock(
        return_value=MagicMock(content="mock LLM response")
    )
    return llm


@pytest.fixture
def initialized_service(service, mock_llm):
    """Return an AgenticService with a mocked LLM, ready to run tasks."""
    service._llm = mock_llm
    service._llm_cache = {"mock-model": mock_llm}
    service._api_key = "test-key"
    service._initialized = True

    # Build the agent (needs deepagents imports to be available)
    try:
        service._build_agent()
    except Exception:
        pytest.skip("DeepAgents dependencies not available")

    return service


def _make_state(**overrides) -> AgentState:
    """Helper to create a minimal AgentState with sensible defaults."""
    defaults: AgentState = {
        "prompt": "test prompt",
        "query": "test query",
        "group_id": "test-group",
        "user_id": "user-1",
        "session_id": "session-1",
        "remaining_steps": [],
    }
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# Initialization Tests
# ---------------------------------------------------------------------------

class TestInitialization:

    @patch("app.agentic.get_settings")
    @patch("app.agentic._LANGCHAIN_AVAILABLE", True)
    @patch("app.agentic.ChatGroq")
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.mcp_client")
    def test_initialize_success(self, mock_mcp, mock_mem0, mock_groq_cls, mock_settings):
        settings = MagicMock()
        settings.groq_api_key = "test-api-key"
        settings.groq_model = "llama-3.3-70b-versatile"
        mock_settings.return_value = settings
        mock_mem0.initialize.return_value = True
        mock_mcp.initialize.return_value = True

        svc = AgenticService()
        result = svc.initialize()

        assert result is True
        assert svc.is_initialized is True

    @patch("app.agentic.get_settings")
    @patch("app.agentic._LANGCHAIN_AVAILABLE", True)
    def test_initialize_without_key(self, mock_settings):
        settings = MagicMock()
        settings.groq_api_key = ""
        mock_settings.return_value = settings

        svc = AgenticService()
        result = svc.initialize()

        assert result is False
        assert svc.is_initialized is False

    @patch("app.agentic._LANGCHAIN_AVAILABLE", False)
    def test_initialize_without_langchain(self):
        svc = AgenticService()
        result = svc.initialize()
        assert result is False





# ---------------------------------------------------------------------------
# LLM Call Tests
# ---------------------------------------------------------------------------

class TestCallLLM:

    @pytest.mark.asyncio
    async def test_call_llm_success(self, initialized_service):
        result = await initialized_service._call_llm(
            "You are a test assistant.", "Say hello"
        )
        assert result == "mock LLM response"

    @pytest.mark.asyncio
    async def test_call_llm_not_initialized(self):
        svc = AgenticService()
        with pytest.raises(RuntimeError, match="not initialized"):
            await svc._call_llm("system", "user")

    @pytest.mark.asyncio
    async def test_call_llm_timeout(self, initialized_service):
        async def slow_invoke(*args, **kwargs):
            await asyncio.sleep(5)
            return MagicMock(content="late")

        initialized_service._llm.ainvoke = slow_invoke

        with pytest.raises((asyncio.TimeoutError, TimeoutError, RetryError)):
            await initialized_service._call_llm(
                "system", "user", timeout=0.1
            )

    @pytest.mark.asyncio
    async def test_call_llm_json_valid(self, initialized_service):
        initialized_service._llm.ainvoke = AsyncMock(
            return_value=MagicMock(content='{"key": "value"}')
        )
        result = await initialized_service._call_llm_json("system", "user")
        assert isinstance(result, dict)
        assert result["key"] == "value"

    @pytest.mark.asyncio
    async def test_call_llm_json_with_code_fences(self, initialized_service):
        initialized_service._llm.ainvoke = AsyncMock(
            return_value=MagicMock(content='```json\n{"key": "value"}\n```')
        )
        result = await initialized_service._call_llm_json("system", "user")
        assert isinstance(result, dict)
        assert result["key"] == "value"


# ---------------------------------------------------------------------------
# Memory Context Formatting Tests
# ---------------------------------------------------------------------------

class TestFormatMemoryContext:

    def test_empty_context(self):
        result = AgenticService._format_memory_context([])
        assert result == "No prior context available."

    def test_with_text_key(self):
        mem = [{"text": "first memory"}, {"text": "second memory"}]
        result = AgenticService._format_memory_context(mem)
        assert "- [1] first memory" in result
        assert "- [2] second memory" in result

    def test_with_memory_key(self):
        mem = [{"memory": "recalled fact"}]
        result = AgenticService._format_memory_context(mem)
        assert "- [1] recalled fact" in result

    def test_fallback_to_str(self):
        mem = [{"some_unexpected": "data"}]
        result = AgenticService._format_memory_context(mem)
        assert "- [1]" in result
        assert "some_unexpected" in result


# ---------------------------------------------------------------------------
# Agent Node Tests
# ---------------------------------------------------------------------------

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.mcp_client")
    async def test_paper_retrieval_tool(self, mock_mcp, mock_db, initialized_service):
        mock_mcp.is_configured.return_value = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(
            return_value=[{"title": "Test Paper", "abstract": "Test abstract"}]
        )

        result = await initialized_service._tool_retrieve_papers(
            query="find papers on NLP", config={"configurable": {"group_id": "test-group"
        }})
        assert "Retrieved 1 papers" in result

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    async def test_literature_survey_tool(self, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_mem0.add = AsyncMock()
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[{"title": "Test Paper", "abstract": "Deep learning..."}])

        result = await initialized_service._tool_survey_literature(
             query="review deep learning for NLP", config={"configurable": {"group_id": "test-group", "user_id": "user-1"
        }})
        assert result == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    async def test_gap_analysis_tool(self, mock_db, mock_mem0, initialized_service):
        mock_mem0.add = AsyncMock()
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])

        result = await initialized_service._tool_analyze_gaps(
             literature_review_context="Prior survey findings...", config={"configurable": {"group_id": "test-group"
        }})
        assert result == "mock LLM response"

    @pytest.mark.asyncio
    async def test_fact_check_tool(self, initialized_service):
        with patch.object(initialized_service, "_load_memory", AsyncMock(return_value=[])):
            result = await initialized_service._tool_fact_check(
                 claim="verify that transformers outperform RNNs", config={"configurable": {"group_id": "g", "user_id": "u"
            }})
            assert result == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    async def test_novelty_assessment_tool(self, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])

        result = await initialized_service._tool_assess_novelty(
             idea="is attention-free transformers novel?", config={"configurable": {"group_id": "g"
        }})
        assert result == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    async def test_research_mentor_tool(self, mock_mem0, initialized_service):
        mock_mem0.add = AsyncMock()
        with patch.object(initialized_service, "_load_memory", AsyncMock(return_value=[])):
            result = await initialized_service._tool_provide_mentoring(
                 query="how should I approach NLP research?", config={"configurable": {"group_id": "g", "user_id": "u"
            }})
            assert result == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    async def test_paper_writing_tool(self, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])

        result = await initialized_service._tool_write_paper_draft(
             paper_request="write a paper on NLP", config={"configurable": {"group_id": "g"
        }})
        assert result == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    async def test_research_planning_tool(self, mock_mem0, initialized_service):
        mock_mem0.add = AsyncMock()
        with patch.object(initialized_service, "_load_memory", AsyncMock(return_value=[])):
            result = await initialized_service._tool_plan_research(
                 request="plan my NLP research", config={"configurable": {"group_id": "g", "user_id": "u"
            }})
            assert result == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.classify_intent")
    async def test_run_task_routes_correctly(self, mock_classify, initialized_service):
        # The primary deep agent is a mock
        initialized_service._agent = AsyncMock()
        initialized_service._agent.ainvoke.return_value = {
            "messages": [MagicMock(content="mock generated response")]
        }

        result = await initialized_service.run_task("fact_check", {
            "prompt": "@ai verify this claim",
            "group_id": "g1",
            "user_id": "u1",
        })

        assert result["task_type"] == "fact_check"
        assert "result" in result
        assert result["result"]["final_response"] == "mock generated response"
        assert "latency_ms" in result





# ---------------------------------------------------------------------------
# Error Boundary Tests
# ---------------------------------------------------------------------------

class TestErrorBoundaries:

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.mcp_client")
    async def test_paper_retrieval_error_boundary(self, mock_mcp, mock_db, initialized_service):
        """When the LLM or DB raises, paper_retrieval should not crash."""
        mock_mcp.is_configured.return_value = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(side_effect=RuntimeError("DB down"))

        result = await initialized_service._tool_retrieve_papers(
             query="find papers", config={"configurable": {"group_id": "g"
        }})
        assert "Error retrieving papers:" in result

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    async def test_literature_survey_error_boundary(self, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        # Force LLM to raise
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("LLM fail"))

        result = await initialized_service._tool_survey_literature(
             query="find papers", config={"configurable": {"group_id": "g", "user_id": "u"
        }})
        assert "Error surveying literature" in result

    @pytest.mark.asyncio
    async def test_fact_check_error_boundary(self, initialized_service):
        with patch.object(initialized_service, "_load_memory", AsyncMock(side_effect=RuntimeError("memory fail"))):
            result = await initialized_service._tool_fact_check(
                 claim="test claim", config={"configurable": {"group_id": "g", "user_id": "u"
            }})
            assert "Error fact checking:" in result

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    async def test_novelty_error_boundary(self, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("boom"))

        result = await initialized_service._tool_assess_novelty(
             idea="test idea", config={"configurable": {"group_id": "g"
        }})
        assert "Error assessing novelty:" in result

    @pytest.mark.asyncio
    async def test_research_mentor_error_boundary(self, initialized_service):
        initialized_service._llm.ainvoke = AsyncMock(side_effect=ValueError("bad model"))
        with patch.object(initialized_service, "_load_memory", AsyncMock(return_value=[])):
            result = await initialized_service._tool_provide_mentoring(
                 query="test query", config={"configurable": {"group_id": "g", "user_id": "u"
            }})
            assert "Error providing mentoring:" in result

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    async def test_paper_writing_error_boundary(self, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        initialized_service._llm.ainvoke = AsyncMock(side_effect=TimeoutError("slow"))

        result = await initialized_service._tool_write_paper_draft(
             paper_request="write a paper on NLP", config={"configurable": {"group_id": "g"
        }})
        assert "Error writing paper draft:" in result

    @pytest.mark.asyncio
    async def test_research_planning_error_boundary(self, initialized_service):
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("model crashed"))

        with patch.object(initialized_service, "_load_memory", AsyncMock(return_value=[])):
            result = await initialized_service._tool_plan_research(
                 request="plan my NLP research", config={"configurable": {"group_id": "g", "user_id": "u"
            }})
            assert "Error planning research:" in result

    @pytest.mark.asyncio
    @patch("app.agentic.get_settings")
    async def test_deep_research_error_boundary(self, mock_settings, initialized_service):
        settings = MagicMock()
        settings.research_model = "mock-model"
        mock_settings.return_value = settings
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("API down"))

        result = await initialized_service._tool_deep_research(
             query="deep research NLP", config={"configurable": {"group_id": "g"
        }})
        assert "Error in deep research:" in result


# ---------------------------------------------------------------------------
# Collect Sources Tests
# ---------------------------------------------------------------------------

class TestCollectSources:

    @pytest.mark.asyncio
    @patch("app.agentic.get_settings")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mcp_client")
    @patch("app.agentic.database")
    async def test_fallback_to_group_papers(self, mock_db, mock_mcp, mock_vs, mock_settings, initialized_service):
        settings = MagicMock()
        settings.search_api = "tavily"
        settings.tavily_api_key = ""  # No key → skip Tavily
        settings.max_search_results = 5
        mock_settings.return_value = settings
        mock_mcp.is_configured.return_value = False
        mock_vs.is_connected = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(
            return_value=[{"title": "Fallback Paper", "abstract": "abc"}]
        )

        state = _make_state()
        sources = await initialized_service._collect_sources(state, ["query1"])
        assert len(sources) == 1
        assert sources[0]["source_type"] == "group_papers"

    @pytest.mark.asyncio
    @patch("app.agentic.get_settings")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mcp_client")
    @patch("app.agentic.database")
    async def test_mcp_source_collection(self, mock_db, mock_mcp, mock_vs, mock_settings, initialized_service):
        settings = MagicMock()
        settings.search_api = "mcp"
        settings.tavily_api_key = ""
        settings.mcp_search_server = "academic_papers"
        settings.mcp_search_tool = "search_arxiv"
        settings.max_search_queries = 2
        settings.max_search_results = 5
        mock_settings.return_value = settings
        mock_mcp.is_configured.return_value = True
        mock_mcp.invoke = AsyncMock(return_value={
            "papers": [{"title": "MCP Paper", "abstract": "from MCP"}]
        })
        mock_vs.is_connected = False
        mock_db.is_connected = False

        state = _make_state()
        sources = await initialized_service._collect_sources(state, ["test query"])
        assert len(sources) == 1
        assert sources[0]["source_type"] == "mcp"

    @pytest.mark.asyncio
    @patch("app.agentic.get_settings")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mcp_client")
    @patch("app.agentic.database")
    async def test_failed_search_logs_warning(self, mock_db, mock_mcp, mock_vs, mock_settings, initialized_service):
        settings = MagicMock()
        settings.search_api = "mcp"
        settings.tavily_api_key = ""
        settings.mcp_search_server = "academic_papers"
        settings.mcp_search_tool = "search_arxiv"
        settings.max_search_queries = 1
        settings.max_search_results = 5
        mock_settings.return_value = settings
        mock_mcp.is_configured.return_value = True
        mock_mcp.invoke = AsyncMock(side_effect=RuntimeError("MCP down"))
        mock_vs.is_connected = False
        mock_db.is_connected = False
        mock_db.get_group_papers = AsyncMock(return_value=[])

        state = _make_state()
        # Should not raise, should return empty and log warning
        sources = await initialized_service._collect_sources(state, ["test"])
        assert sources == []


# ---------------------------------------------------------------------------
# Summarize Sources Tests
# ---------------------------------------------------------------------------

class TestSummarizeSources:

    @pytest.mark.asyncio
    @patch("app.agentic.get_settings")
    async def test_parallel_summarization(self, mock_settings, initialized_service):
        settings = MagicMock()
        settings.max_source_summaries = 3
        settings.summarization_model = "mock-model"
        mock_settings.return_value = settings

        sources = [
            {"title": f"Source {i}", "content": f"content {i}", "url": f"http://s{i}.com"}
            for i in range(3)
        ]
        result = await initialized_service._summarize_sources("test query", sources)
        # Should have 3 summaries, all containing [S1], [S2], [S3]
        assert "[S1]" in result
        assert "[S2]" in result
        assert "[S3]" in result


# ---------------------------------------------------------------------------
# Auto Intent Classification Tests
# ---------------------------------------------------------------------------

class TestAutoIntentClassification:

    @pytest.mark.asyncio
    @patch("app.agentic.classify_intent")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.mcp_client")
    async def test_auto_classify_when_task_empty(
        self, mock_mcp, mock_mem0, mock_vs, mock_db, mock_classify, initialized_service
    ):
        mock_classify.return_value = ("fact_check", 0.92, "verify the claim")
        mock_mcp.is_configured.return_value = False
        mock_mem0.search = AsyncMock(return_value=[])
        mock_vs.is_connected = False
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value=None)

        result = await initialized_service.run_task("", {
            "prompt": "@ai verify this claim about GPT",
            "group_id": "g1",
            "user_id": "u1",
        })
        mock_classify.assert_called_once()
        assert result["task_type"] == "fact_check"

    @pytest.mark.asyncio
    @patch("app.agentic.classify_intent")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.mcp_client")
    async def test_auto_classify_when_task_is_auto(
        self, mock_mcp, mock_mem0, mock_vs, mock_db, mock_classify, initialized_service
    ):
        mock_classify.return_value = ("literature_survey", 0.88, "survey the field")
        mock_mcp.is_configured.return_value = False
        mock_mem0.search = AsyncMock(return_value=[])
        mock_mem0.add = AsyncMock()
        mock_vs.is_connected = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_db.store_ai_artifact = AsyncMock(return_value=None)

        result = await initialized_service.run_task("auto", {
            "prompt": "@ai survey the field of NLP",
            "group_id": "g1",
            "user_id": "u1",
        })
        mock_classify.assert_called_once()
        assert result["task_type"] == "literature_survey"

    @pytest.mark.asyncio
    @patch("app.agentic.classify_intent")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.mcp_client")
    async def test_auto_classify_below_threshold_defaults(
        self, mock_mcp, mock_mem0, mock_vs, mock_db, mock_classify, initialized_service
    ):
        mock_classify.return_value = (None, 0.45, None)
        mock_mcp.is_configured.return_value = False
        mock_mem0.search = AsyncMock(return_value=[])
        mock_mem0.add = AsyncMock()
        mock_vs.is_connected = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_db.store_ai_artifact = AsyncMock(return_value=None)

        result = await initialized_service.run_task("", {
            "prompt": "@ai hello",
            "group_id": "g1",
            "user_id": "u1",
        })
        assert result["task_type"] == "literature_survey"

    @pytest.mark.asyncio
    @patch("app.agentic.classify_intent")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.mcp_client")
    async def test_explicit_task_skips_classify(
        self, mock_mcp, mock_mem0, mock_vs, mock_db, mock_classify, initialized_service
    ):
        mock_mcp.is_configured.return_value = False
        mock_mem0.search = AsyncMock(return_value=[])
        mock_vs.is_connected = False
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value=None)

        result = await initialized_service.run_task("fact_check", {
            "prompt": "@ai check this",
            "group_id": "g1",
            "user_id": "u1",
        })
        mock_classify.assert_not_called()
        assert result["task_type"] == "fact_check"


# ---------------------------------------------------------------------------
# Run Task Response Tests
# ---------------------------------------------------------------------------

class TestRunTaskResponse:

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.mcp_client")
    async def test_response_includes_errors_field(
        self, mock_mcp, mock_mem0, mock_vs, mock_db, initialized_service
    ):
        mock_mcp.is_configured.return_value = False
        mock_mem0.search = AsyncMock(return_value=[])
        mock_vs.is_connected = False
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value=None)

        result = await initialized_service.run_task("fact_check", {
            "prompt": "@ai test",
            "group_id": "g1",
            "user_id": "u1",
        })
        # errors field should always be present (even if empty)
        assert "errors" in result
        assert isinstance(result["errors"], list)
