"""Tests for the agentic orchestration service."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from tenacity import RetryError

from app.agentic import AgenticService, AgentState, MULTI_STEP_CHAINS


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

    # Build the graph (needs LangGraph imports to be available)
    try:
        service._graph = service._build_graph()
    except Exception:
        pytest.skip("LangGraph dependencies not available")

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
# Routing Tests
# ---------------------------------------------------------------------------

class TestRouting:

    def test_route_task_single_step(self, initialized_service):
        state: AgentState = {"task_type": "fact_check", "remaining_steps": []}
        result = initialized_service._route_task(state)
        assert result == "fact_check"

    def test_route_task_multi_step_chain(self, initialized_service):
        state: AgentState = {"task_type": "gap_analysis", "remaining_steps": []}
        result = initialized_service._route_task(state)
        # gap_analysis chain: paper_retrieval → literature_survey → gap_analysis
        assert result == "paper_retrieval"

    def test_route_task_default(self, initialized_service):
        state: AgentState = {"task_type": "", "remaining_steps": []}
        result = initialized_service._route_task(state)
        assert result == "literature_survey"

    def test_route_node_sets_remaining_steps_for_chain(self, initialized_service):
        state: AgentState = {"task_type": "gap_analysis", "remaining_steps": []}
        result = initialized_service._route_node(state)
        # _route_node stores chain[1:] because chain[0] is consumed by _route_task
        assert result["remaining_steps"] == ["literature_survey", "gap_analysis"]

    def test_route_node_empty_remaining_for_single_step(self, initialized_service):
        state: AgentState = {"task_type": "fact_check", "remaining_steps": []}
        result = initialized_service._route_node(state)
        assert result["remaining_steps"] == []

    def test_route_task_does_not_mutate_state(self, initialized_service):
        """_route_task is a conditional edge and must not mutate state."""
        state: AgentState = {"task_type": "gap_analysis", "remaining_steps": ["lit", "gap"]}
        initialized_service._route_task(state)
        # remaining_steps must be unchanged
        assert state["remaining_steps"] == ["lit", "gap"]

    def test_should_continue_with_remaining(self, initialized_service):
        state: AgentState = {"remaining_steps": ["gap_analysis"]}
        result = initialized_service._should_continue(state)
        assert result == "gap_analysis"
        assert state["remaining_steps"] == []

    def test_should_continue_empty(self, initialized_service):
        from langgraph.graph import END
        state: AgentState = {"remaining_steps": []}
        result = initialized_service._should_continue(state)
        assert result == END

    def test_multi_step_chains_exist(self):
        assert "gap_analysis" in MULTI_STEP_CHAINS
        assert "paper_retrieval" in MULTI_STEP_CHAINS["gap_analysis"]
        assert "literature_survey" in MULTI_STEP_CHAINS["gap_analysis"]


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

class TestAgentNodes:

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mcp_client")
    async def test_paper_retrieval_agent(self, mock_mcp, mock_vs, mock_db, initialized_service):
        mock_mcp.is_configured.return_value = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(
            return_value=[{"title": "Test Paper", "abstract": "Test abstract"}]
        )
        mock_db.store_ai_artifact = AsyncMock(return_value=None)
        mock_vs.is_connected = False

        state = _make_state(prompt="find papers on NLP", query="find papers on NLP")
        result = await initialized_service._paper_retrieval_agent(state)
        assert "papers" in result
        assert len(result["papers"]) >= 1
        assert "result" in result

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_literature_survey_agent(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_mem0.add = AsyncMock()
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_db.store_ai_artifact = AsyncMock(return_value="art-1")
        mock_vs.is_connected = False

        state = _make_state(
            prompt="review deep learning for NLP",
            papers=[{"title": "Test Paper", "abstract": "Deep learning..."}],
        )
        result = await initialized_service._literature_survey_agent(state)
        assert "literature_review" in result
        assert result["literature_review"] == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_gap_analysis_uses_prior_review(self, mock_vs, mock_db, mock_mem0, initialized_service):
        """Gap analysis should use the literature_review from a previous step."""
        mock_mem0.add = AsyncMock()
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_db.store_ai_artifact = AsyncMock(return_value="art-2")
        mock_vs.is_connected = False

        state = _make_state(
            prompt="identify gaps",
            literature_review="Prior survey findings...",
        )
        result = await initialized_service._gap_analysis_agent(state)
        assert "research_gaps" in result

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_fact_check_agent(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value=None)
        mock_vs.is_connected = False

        state = _make_state(prompt="verify that transformers outperform RNNs")
        result = await initialized_service._fact_check_agent(state)
        assert "fact_check" in result
        assert result["fact_check"] == {"analysis": "mock LLM response"}
        assert "result" in result

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_novelty_assessment_agent(self, mock_vs, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_db.store_ai_artifact = AsyncMock(return_value=None)
        mock_vs.is_connected = False

        state = _make_state(prompt="is attention-free transformers novel?")
        result = await initialized_service._novelty_assessment_agent(state)
        assert "novelty" in result
        assert result["novelty"] == {"analysis": "mock LLM response"}

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_research_mentor_agent(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_mem0.add = AsyncMock()
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value=None)
        mock_vs.is_connected = False

        state = _make_state(prompt="how should I approach NLP research?")
        result = await initialized_service._research_mentor_agent(state)
        assert "mentor_advice" in result
        assert result["mentor_advice"] == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_paper_writing_agent(self, mock_vs, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_db.store_ai_artifact = AsyncMock(return_value=None)
        mock_vs.is_connected = False

        state = _make_state(prompt="write a paper on NLP")
        result = await initialized_service._paper_writing_agent(state)
        assert "paper_draft" in result
        assert result["paper_draft"] == "mock LLM response"

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_research_planning_agent(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_mem0.add = AsyncMock()
        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value=None)
        mock_vs.is_connected = False

        state = _make_state(prompt="plan my NLP research")
        result = await initialized_service._research_planning_agent(state)
        assert "research_plan" in result
        assert result["result"] == {"research_plan": "mock LLM response"}

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.mcp_client")
    async def test_run_task_routes_correctly(self, mock_mcp, mock_mem0, mock_vs, mock_db, initialized_service):
        mock_mcp.is_configured.return_value = False
        mock_mem0.search = AsyncMock(return_value=[])
        mock_mem0.add = AsyncMock()
        mock_vs.is_connected = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_db.store_ai_artifact = AsyncMock(return_value=None)

        result = await initialized_service.run_task("fact_check", {
            "prompt": "@ai verify this claim",
            "group_id": "g1",
            "user_id": "u1",
        })

        assert result["task_type"] == "fact_check"
        assert "result" in result
        assert "latency_ms" in result


# ---------------------------------------------------------------------------
# Deep Research Agent Tests
# ---------------------------------------------------------------------------

class TestDeepResearchAgent:

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.get_settings")
    async def test_deep_research_full(self, mock_settings, mock_vs, mock_db, initialized_service):
        settings = MagicMock()
        settings.research_model = "mock-model"
        settings.compression_model = "mock-model"
        settings.final_report_model = "mock-model"
        settings.max_source_summaries = 2
        settings.summarization_model = "mock-model"
        mock_settings.return_value = settings

        mock_db.is_connected = True
        mock_db.store_ai_artifact = AsyncMock(return_value="art-deep")
        mock_vs.is_connected = False

        # Mock _collect_sources and LLM to control flow
        initialized_service._collect_sources = AsyncMock(return_value=[
            {"title": "Source 1", "content": "Content about AI", "url": "http://example.com/1", "source_type": "tavily"},
            {"title": "Source 2", "content": "Content about ML", "url": "http://example.com/2", "source_type": "mcp"},
        ])

        # The LLM is called 4+ times: plan, summarize x2, compress, report
        responses = [
            '["query 1", "query 2"]',  # plan
            "summary bullet 1",  # summarize source 1
            "summary bullet 2",  # summarize source 2
            "compressed notes",  # compress
            "final deep research report",  # report
        ]
        call_idx = 0
        async def mock_ainvoke(*args, **kwargs):
            nonlocal call_idx
            content = responses[min(call_idx, len(responses) - 1)]
            call_idx += 1
            return MagicMock(content=content)
        initialized_service._llm.ainvoke = mock_ainvoke

        state = _make_state(prompt="@ai deep research on transformers")
        result = await initialized_service._deep_research_agent(state)

        assert "deep_research" in result
        assert "sources" in result
        assert "research_notes" in result
        assert result.get("errors") is None or len(result.get("errors", [])) == 0


# ---------------------------------------------------------------------------
# Error Boundary Tests
# ---------------------------------------------------------------------------

class TestErrorBoundaries:

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    @patch("app.agentic.mcp_client")
    async def test_paper_retrieval_error_boundary(self, mock_mcp, mock_vs, mock_db, initialized_service):
        """When the LLM or DB raises, paper_retrieval should not crash."""
        mock_mcp.is_configured.return_value = False
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(side_effect=RuntimeError("DB down"))
        mock_vs.is_connected = False

        state = _make_state()
        result = await initialized_service._paper_retrieval_agent(state)
        assert "errors" in result
        assert any("paper_retrieval" in e for e in result["errors"])

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_literature_survey_error_boundary(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_vs.is_connected = False
        # Force LLM to raise
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("LLM fail"))

        state = _make_state()
        result = await initialized_service._literature_survey_agent(state)
        assert "errors" in result
        assert any("literature_survey" in e for e in result["errors"])

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_fact_check_error_boundary(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(side_effect=RuntimeError("memory fail"))
        mock_db.is_connected = False
        mock_vs.is_connected = False

        state = _make_state()
        result = await initialized_service._fact_check_agent(state)
        assert "errors" in result
        assert any("fact_check" in e for e in result["errors"])

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_novelty_error_boundary(self, mock_vs, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_vs.is_connected = False
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("boom"))

        state = _make_state()
        result = await initialized_service._novelty_assessment_agent(state)
        assert "errors" in result
        assert any("novelty_assessment" in e for e in result["errors"])

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_research_mentor_error_boundary(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_db.is_connected = False
        mock_vs.is_connected = False
        initialized_service._llm.ainvoke = AsyncMock(side_effect=ValueError("bad model"))

        state = _make_state()
        result = await initialized_service._research_mentor_agent(state)
        assert "errors" in result
        assert any("research_mentor" in e for e in result["errors"])

    @pytest.mark.asyncio
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_paper_writing_error_boundary(self, mock_vs, mock_db, initialized_service):
        mock_db.is_connected = True
        mock_db.get_group_papers = AsyncMock(return_value=[])
        mock_vs.is_connected = False
        initialized_service._llm.ainvoke = AsyncMock(side_effect=TimeoutError("slow"))

        state = _make_state()
        result = await initialized_service._paper_writing_agent(state)
        assert "errors" in result
        assert any("paper_writing" in e for e in result["errors"])

    @pytest.mark.asyncio
    @patch("app.agentic.mem0_adapter")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_research_planning_error_boundary(self, mock_vs, mock_db, mock_mem0, initialized_service):
        mock_mem0.search = AsyncMock(return_value=[])
        mock_db.is_connected = False
        mock_vs.is_connected = False
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("model crashed"))

        state = _make_state()
        result = await initialized_service._research_planning_agent(state)
        assert "errors" in result
        assert any("research_planning" in e for e in result["errors"])

    @pytest.mark.asyncio
    @patch("app.agentic.get_settings")
    @patch("app.agentic.database")
    @patch("app.agentic.vector_store")
    async def test_deep_research_error_boundary(self, mock_vs, mock_db, mock_settings, initialized_service):
        settings = MagicMock()
        settings.research_model = "mock-model"
        mock_settings.return_value = settings
        mock_db.is_connected = False
        mock_vs.is_connected = False
        initialized_service._llm.ainvoke = AsyncMock(side_effect=RuntimeError("API down"))

        state = _make_state()
        result = await initialized_service._deep_research_agent(state)
        assert "errors" in result
        assert any("deep_research" in e for e in result["errors"])


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
