"""Agentic orchestration service using LangGraph, LangChain-Groq, and Mem0."""

from __future__ import annotations

import asyncio
import logging
import time
import json
import re
import uuid
import httpx
from typing import Any, Optional, TypedDict

logger = logging.getLogger(__name__)

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

try:
    from langgraph.graph import StateGraph, END
    from langchain_groq import ChatGroq
    from langchain_core.messages import SystemMessage, HumanMessage
    _LANGCHAIN_AVAILABLE = True
    _LANGCHAIN_IMPORT_ERROR: Optional[Exception] = None
except Exception as exc:  # pragma: no cover - optional dependency import
    StateGraph = None  # type: ignore[assignment]
    END = None  # type: ignore[assignment]
    ChatGroq = None  # type: ignore[assignment]
    SystemMessage = None  # type: ignore[assignment]
    HumanMessage = None  # type: ignore[assignment]
    _LANGCHAIN_AVAILABLE = False
    _LANGCHAIN_IMPORT_ERROR = exc

from .config import get_settings
from .database import database
from .vector_store import vector_store
from .memory import mem0_adapter
from .mcp_client import mcp_client
from .intent_classifier import classify_intent

# Default timeout for a single LLM call (seconds).
_LLM_CALL_TIMEOUT = 60

# Multi-step task chains: defines which agent sequences are supported.
# When a task_type appears as a key here the graph will execute the full
# chain in order instead of a single node.
MULTI_STEP_CHAINS: dict[str, list[str]] = {
    "gap_analysis": ["paper_retrieval", "literature_survey", "gap_analysis"],
    "paper_writing": ["paper_retrieval", "literature_survey", "paper_writing"],
}


class AgentState(TypedDict, total=False):
    task_type: str
    prompt: str
    query: str
    group_id: str
    user_id: str
    session_id: str
    paper_ids: list[str]
    papers: list[dict]
    literature_review: str
    research_gaps: list[dict]
    fact_check: dict
    novelty: dict
    mentor_advice: str
    paper_draft: str
    deep_research: str
    research_plan: Any
    sources: list[dict]
    research_notes: str
    memory_context: list[dict]
    result: dict
    artifacts: list[str]
    metadata: dict
    errors: list[str]
    # Multi-step tracking
    remaining_steps: list[str]
    # Request tracing
    trace_id: str


class AgenticService:
    """Orchestrates agentic workflows using LangGraph."""

    def __init__(self) -> None:
        self._llm: Optional[Any] = None
        self._llm_cache: dict[str, Any] = {}
        self._api_key: str = ""
        self._graph = None
        self._initialized = False

    def initialize(self) -> bool:
        if not _LANGCHAIN_AVAILABLE:
            logger.warning(
                "Agentic dependencies unavailable - agentic features disabled: %s",
                _LANGCHAIN_IMPORT_ERROR,
            )
            return False
        settings = get_settings()
        if not settings.groq_api_key:
            logger.warning("Groq API key not set - agentic features unavailable")
            return False

        self._api_key = settings.groq_api_key

        self._llm = ChatGroq(
            api_key=settings.groq_api_key,
            model_name=settings.groq_model,
            temperature=0.3,
        )
        self._llm_cache = {settings.groq_model: self._llm}

        mem0_adapter.initialize()
        mcp_client.initialize()
        self._graph = self._build_graph()
        self._initialized = True
        logger.info("Agentic service initialized (LangGraph)")
        return True

    @property
    def is_initialized(self) -> bool:
        return self._initialized and self._graph is not None

    # ------------------------------------------------------------------
    # Graph construction
    # ------------------------------------------------------------------

    def _build_graph(self):
        if StateGraph is None or END is None:
            raise RuntimeError("LangGraph dependencies not available")
        graph = StateGraph(AgentState)

        # Nodes
        graph.add_node("route", self._route_node)
        graph.add_node("paper_retrieval", self._paper_retrieval_agent)
        graph.add_node("literature_survey", self._literature_survey_agent)
        graph.add_node("gap_analysis", self._gap_analysis_agent)
        graph.add_node("fact_check", self._fact_check_agent)
        graph.add_node("novelty_assessment", self._novelty_assessment_agent)
        graph.add_node("research_mentor", self._research_mentor_agent)
        graph.add_node("paper_writing", self._paper_writing_agent)
        graph.add_node("research_planning", self._research_planning_agent)
        graph.add_node("deep_research", self._deep_research_agent)

        graph.set_entry_point("route")

        # Route → first agent (conditional)
        graph.add_conditional_edges(
            "route",
            self._route_task,
            {
                "paper_retrieval": "paper_retrieval",
                "literature_survey": "literature_survey",
                "gap_analysis": "gap_analysis",
                "fact_check": "fact_check",
                "novelty_assessment": "novelty_assessment",
                "research_mentor": "research_mentor",
                "paper_writing": "paper_writing",
                "research_planning": "research_planning",
                "deep_research": "deep_research",
            },
        )

        # Multi-step capable agents: conditional edges to continue or end
        for node in [
            "paper_retrieval",
            "literature_survey",
            "paper_writing",
            "gap_analysis",
        ]:
            graph.add_conditional_edges(
                node,
                self._should_continue,
                {
                    "paper_retrieval": "paper_retrieval",
                    "literature_survey": "literature_survey",
                    "gap_analysis": "gap_analysis",
                    "paper_writing": "paper_writing",
                    END: END,
                },
            )

        # Single-step agents: always end
        for node in [
            "fact_check",
            "novelty_assessment",
            "research_mentor",
            "research_planning",
            "deep_research",
        ]:
            graph.add_edge(node, END)

        return graph.compile()

    # ------------------------------------------------------------------
    # Routing helpers
    # ------------------------------------------------------------------

    def _route_task(self, state: AgentState) -> str:
        """Return the first agent node to execute.

        This is a conditional edge function — it must NOT mutate *state*.
        The ``_route_node`` graph node is responsible for initialising
        ``remaining_steps`` before this function is called.
        """
        task = state.get("task_type", "").strip().lower()
        if not task:
            task = "literature_survey"

        chain = MULTI_STEP_CHAINS.get(task)
        if chain:
            return chain[0]

        return task

    def _route_node(self, state: AgentState) -> AgentState:
        """Entry node: set up multi-step chains if applicable."""
        task = state.get("task_type", "").strip().lower()
        if not task:
            task = "literature_survey"

        chain = MULTI_STEP_CHAINS.get(task)
        if chain:
            # Store steps after the first; the first is consumed by _route_task
            state["remaining_steps"] = list(chain[1:])
        else:
            state["remaining_steps"] = []
        return state

    def _should_continue(self, state: AgentState) -> str:
        """Decide the next node for multi-step chains.

        If ``remaining_steps`` still has entries, pop the next one and
        route there.  Otherwise route to END.
        """
        remaining = state.get("remaining_steps") or []
        if remaining:
            next_step = remaining.pop(0)
            state["remaining_steps"] = remaining
            return next_step
        return END

    # ------------------------------------------------------------------
    # LLM helpers (with retry & timeout)
    # ------------------------------------------------------------------

    def _get_llm(self, model_name: Optional[str] = None, temperature: float = 0.3) -> Any:
        if not self._llm:
            raise RuntimeError("Agentic LLM not initialized")
        if not model_name:
            return self._llm
        cached = self._llm_cache.get(model_name)
        if cached:
            return cached
        llm = ChatGroq(
            api_key=self._api_key,
            model_name=model_name,
            temperature=temperature,
        )
        self._llm_cache[model_name] = llm
        return llm

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError, asyncio.TimeoutError)),
    )
    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        model_name: Optional[str] = None,
        temperature: float = 0.3,
        timeout: float = _LLM_CALL_TIMEOUT,
    ) -> str:
        """Call the LLM with retry and timeout protection."""
        if not self._llm:
            raise RuntimeError("Agentic LLM not initialized")
        if SystemMessage is None or HumanMessage is None:
            raise RuntimeError("LangChain message classes not available")

        llm = self._get_llm(model_name=model_name, temperature=temperature)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        response = await asyncio.wait_for(
            llm.ainvoke(messages),
            timeout=timeout,
        )
        return response.content if hasattr(response, "content") else str(response)

    async def _call_llm_json(
        self,
        system_prompt: str,
        user_prompt: str,
        model_name: Optional[str] = None,
        temperature: float = 0.2,
    ) -> Any:
        """Call the LLM expecting a JSON response. Retries on parse failure."""
        for attempt in range(3):
            raw = await self._call_llm(
                system_prompt,
                user_prompt + "\n\nReturn valid JSON only, no other text.",
                model_name=model_name,
                temperature=temperature,
            )
            # Strip markdown code fences if present
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                if attempt == 2:
                    return raw  # Give up, return raw text
                continue  # Retry

    def _parse_json_list(self, text: str) -> list[str]:
        """Parse a JSON array of strings from model output, with fallback heuristics."""
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return [str(item).strip() for item in data if str(item).strip()]
        except json.JSONDecodeError:
            pass

        candidates = []
        for line in text.splitlines():
            cleaned = line.strip().lstrip("-•*").strip()
            if cleaned:
                candidates.append(cleaned)
        return candidates

    # ------------------------------------------------------------------
    # Source collection helpers
    # ------------------------------------------------------------------

    async def _collect_sources(self, state: AgentState, queries: list[str]) -> list[dict]:
        settings = get_settings()
        sources: list[dict] = []

        def _add_source(item: dict, source_type: str) -> None:
            title = item.get("title") or item.get("name") or "Untitled"
            content = item.get("abstract") or item.get("snippet") or item.get("content") or ""
            url = item.get("url") or item.get("link") or item.get("pdf_url")
            sources.append({
                "title": title,
                "content": content,
                "url": url,
                "source_type": source_type,
            })

        if settings.search_api in {"tavily", "hybrid"} and settings.tavily_api_key:
            for query in queries[: settings.max_search_queries]:
                try:
                    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
                        response = await client.post(
                            "https://api.tavily.com/search",
                            json={
                                "api_key": settings.tavily_api_key,
                                "query": query,
                                "max_results": settings.max_search_results,
                                "search_depth": settings.tavily_search_depth,
                                "include_answer": settings.tavily_include_answer,
                            },
                        )
                    response.raise_for_status()
                    data = response.json()
                    results = data.get("results") or []
                    for item in results:
                        _add_source(item, "tavily")
                except Exception as exc:
                    logger.warning("Tavily search failed for query %r: %s", query, exc)
                    continue

        if settings.search_api in {"mcp", "hybrid"} and mcp_client.is_configured(settings.mcp_search_server):
            for query in queries[: settings.max_search_queries]:
                try:
                    response = await mcp_client.invoke(
                        settings.mcp_search_server,
                        settings.mcp_search_tool,
                        {"query": query, "limit": settings.max_search_results},
                    )
                    results = response.get("papers") or response.get("results") or []
                    for item in results:
                        _add_source(item, "mcp")
                except Exception as exc:
                    logger.warning("MCP search failed for query %r: %s", query, exc)
                    continue

        if settings.search_api in {"vector_store", "hybrid"} and vector_store.is_connected:
            group_id = state.get("group_id")
            for query in queries[: settings.max_search_queries]:
                try:
                    results = await vector_store.search_group_vectors(
                        group_id=group_id,
                        query=query,
                        limit=settings.max_search_results,
                        content_types=None,
                        paper_id=None,
                    )
                    for item in results:
                        _add_source(item, "vector_store")
                except Exception as exc:
                    logger.warning("Vector store search failed for query %r: %s", query, exc)
                    continue

        if not sources:
            papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))
            for paper in papers[: settings.max_search_results]:
                _add_source(paper, "group_papers")

        return sources

    async def _summarize_sources(self, query: str, sources: list[dict]) -> str:
        """Summarize sources concurrently using asyncio.gather."""
        settings = get_settings()

        async def _summarize_one(idx: int, source: dict) -> str:
            title = source.get("title", "Untitled")
            content = source.get("content", "")
            url = source.get("url", "")
            system_prompt = (
                "You are a research summarization assistant. Summarize the source in 3-5 bullets. "
                "Highlight key findings relevant to the query."
            )
            user_prompt = (
                f"Query: {query}\n\n"
                f"Source title: {title}\n"
                f"Source url: {url}\n\n"
                f"Source content:\n{content}\n\n"
                "Return bullet points only."
            )
            try:
                summary = await self._call_llm(
                    system_prompt,
                    user_prompt,
                    model_name=settings.summarization_model,
                    temperature=0.2,
                )
                return f"[S{idx}] {title}\n{summary.strip()}"
            except Exception as exc:
                logger.warning("Failed to summarize source %d (%s): %s", idx, title, exc)
                return f"[S{idx}] {title}\n(summary unavailable)"

        tasks = [
            _summarize_one(idx, source)
            for idx, source in enumerate(sources[: settings.max_source_summaries], start=1)
        ]
        summaries = await asyncio.gather(*tasks)
        return "\n\n".join(summaries)

    # ------------------------------------------------------------------
    # Memory / artifact helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_memory_context(memory_context: list[dict]) -> str:
        """Format a list of memory dicts into a readable string for prompts."""
        if not memory_context:
            return "No prior context available."
        lines = []
        for idx, mem in enumerate(memory_context, start=1):
            text = mem.get("text") or mem.get("memory") or str(mem)
            lines.append(f"- [{idx}] {text}")
        return "\n".join(lines)

    async def _load_memory(self, state: AgentState) -> list[dict]:
        query = state.get("query") or state.get("prompt") or ""
        user_id = state.get("user_id")
        if not user_id:
            return []
        return await mem0_adapter.search(
            query=query,
            user_id=user_id,
            group_id=state.get("group_id"),
            limit=5,
        )

    async def _store_artifact(
        self,
        state: AgentState,
        artifact_type: str,
        content: str,
        metadata: Optional[dict] = None,
    ) -> Optional[str]:
        if not database.is_connected or not state.get("group_id"):
            return None

        artifact_id = await database.store_ai_artifact(
            group_id=state.get("group_id"),
            artifact_type=artifact_type,
            content=content,
            prompt=state.get("prompt"),
            session_id=state.get("session_id"),
            user_id=state.get("user_id"),
            metadata=metadata,
        )

        if artifact_id and vector_store.is_connected:
            await vector_store.insert_vector(
                group_id=state.get("group_id"),
                paper_id=state.get("paper_ids", ["system"])[0]
                if state.get("paper_ids")
                else "system",
                content=content,
                content_type=artifact_type,
                content_id=artifact_id,
                metadata={"artifact_type": artifact_type, **(metadata or {})},
            )

        return artifact_id

    async def _get_group_papers(self, group_id: Optional[str]) -> list[dict]:
        if not group_id or not database.is_connected:
            return []
        return await database.get_group_papers(group_id)

    def _format_papers(self, papers: list[dict], max_items: int = 8) -> str:
        if not papers:
            return "No papers available."
        lines = []
        for paper in papers[:max_items]:
            title = paper.get("title", "Untitled")
            abstract = paper.get("abstract", "")
            lines.append(f"- {title}: {abstract[:400]}")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Agent nodes
    # ------------------------------------------------------------------

    async def _paper_retrieval_agent(self, state: AgentState) -> AgentState:
        try:
            query = state.get("query") or state.get("prompt") or ""
            group_id = state.get("group_id")
            papers: list[dict] = []

            if mcp_client.is_configured("academic_papers"):
                try:
                    mcp_response = await mcp_client.invoke(
                        "academic_papers",
                        "search_arxiv",
                        {"query": query, "limit": 10},
                    )
                    papers = mcp_response.get("papers", [])
                except Exception as exc:
                    logger.warning("MCP paper retrieval failed: %s", exc)
                    papers = []

            if not papers:
                papers = await self._get_group_papers(group_id)

            state["papers"] = papers
            summary = f"Retrieved {len(papers)} papers for query: {query}".strip()
            state["result"] = {"summary": summary, "papers": papers[:10]}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="paper_retrieval",
                content=summary,
                metadata={"papers_count": len(papers)},
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)
        except Exception as exc:
            logger.error("paper_retrieval agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"paper_retrieval: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _literature_survey_agent(self, state: AgentState) -> AgentState:
        try:
            papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))
            memory_context = await self._load_memory(state)
            state["memory_context"] = memory_context

            system_prompt = (
                "You are the Literature Survey Agent. Synthesize papers into a structured "
                "literature review with themes, timeline, and key contributions."
            )

            user_prompt = (
                f"User query: {state.get('prompt', '')}\n\n"
                f"Memory context:\n{self._format_memory_context(memory_context)}\n\n"
                f"Papers:\n{self._format_papers(papers)}\n\n"
                "Provide: (1) Thematic sections, (2) Key papers per theme, (3) Trends."
            )

            review = await self._call_llm(system_prompt, user_prompt)
            state["literature_review"] = review
            state["result"] = {"literature_review": review}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="literature_survey",
                content=review,
                metadata={"papers_count": len(papers)},
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)

            await mem0_adapter.add(
                text=review,
                user_id=state.get("user_id", ""),
                group_id=state.get("group_id"),
                memory_type="survey",
            )
        except Exception as exc:
            logger.error("literature_survey agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"literature_survey: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _gap_analysis_agent(self, state: AgentState) -> AgentState:
        try:
            papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))
            literature_review = state.get("literature_review", "")

            # In a multi-step chain the literature_review will already be
            # populated by a preceding literature_survey node.  If it is
            # missing (single-step invocation) we note that in the prompt
            # instead of manually calling another agent function.
            review_context = literature_review or "No prior literature review available."

            system_prompt = (
                "You are the Gap Analysis Agent. Identify research gaps, unresolved debates, "
                "and underexplored areas based on the literature review."
            )

            user_prompt = (
                f"Literature review:\n{review_context}\n\n"
                f"Papers:\n{self._format_papers(papers)}\n\n"
                "Return a prioritized list of gaps with significance and suggested approaches."
            )

            gaps_text = await self._call_llm(system_prompt, user_prompt)
            state["research_gaps"] = [{"description": gaps_text}]
            state["result"] = {"gaps": gaps_text}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="gap_analysis",
                content=gaps_text,
                metadata={"papers_count": len(papers)},
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)

            await mem0_adapter.add(
                text=gaps_text,
                user_id=state.get("user_id", ""),
                group_id=state.get("group_id"),
                memory_type="gaps",
            )
        except Exception as exc:
            logger.error("gap_analysis agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"gap_analysis: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _fact_check_agent(self, state: AgentState) -> AgentState:
        try:
            query = state.get("prompt") or ""
            memory_context = await self._load_memory(state)

            system_prompt = (
                "You are the Fact-Checking Agent. Verify claims against available context. "
                "Return supported, contradicted, or unclear with evidence."
            )

            user_prompt = (
                f"Claim to verify: {query}\n\n"
                f"Memory context:\n{self._format_memory_context(memory_context)}\n\n"
                "Provide a verification status and evidence summary."
            )

            fact_check = await self._call_llm(system_prompt, user_prompt)
            state["fact_check"] = {"analysis": fact_check}
            state["result"] = {"fact_check": fact_check}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="fact_check",
                content=fact_check,
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)
        except Exception as exc:
            logger.error("fact_check agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"fact_check: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _novelty_assessment_agent(self, state: AgentState) -> AgentState:
        try:
            query = state.get("prompt") or ""
            papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))

            system_prompt = (
                "You are the Novelty Assessment Agent. Compare the idea against existing papers "
                "and assess novelty with a score and suggestions to differentiate."
            )

            user_prompt = (
                f"Idea: {query}\n\n"
                f"Related papers:\n{self._format_papers(papers)}\n\n"
                "Return: novelty score (0-100), overlaps, and differentiation suggestions."
            )

            novelty = await self._call_llm(system_prompt, user_prompt)
            state["novelty"] = {"analysis": novelty}
            state["result"] = {"novelty": novelty}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="novelty_assessment",
                content=novelty,
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)
        except Exception as exc:
            logger.error("novelty_assessment agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"novelty_assessment: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _research_mentor_agent(self, state: AgentState) -> AgentState:
        try:
            query = state.get("prompt") or ""
            memory_context = await self._load_memory(state)

            system_prompt = (
                "You are the Research Mentor Agent. Provide personalized guidance, "
                "methodology advice, and next steps."
            )

            user_prompt = (
                f"User query: {query}\n\n"
                f"User memory:\n{self._format_memory_context(memory_context)}\n\n"
                "Provide actionable mentoring advice and suggested next steps."
            )

            advice = await self._call_llm(system_prompt, user_prompt)
            state["mentor_advice"] = advice
            state["result"] = {"mentor_advice": advice}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="research_mentor",
                content=advice,
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)

            await mem0_adapter.add(
                text=advice,
                user_id=state.get("user_id", ""),
                group_id=state.get("group_id"),
                memory_type="mentoring",
            )
        except Exception as exc:
            logger.error("research_mentor agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"research_mentor: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _paper_writing_agent(self, state: AgentState) -> AgentState:
        try:
            query = state.get("prompt") or ""
            papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))

            system_prompt = (
                "You are the Paper Writing Agent. Draft a structured paper outline and "
                "key sections aligned with academic standards."
            )

            user_prompt = (
                f"Paper request: {query}\n\n"
                f"Reference papers:\n{self._format_papers(papers)}\n\n"
                "Provide: title, abstract, outline, and a starter introduction."
            )

            draft = await self._call_llm(system_prompt, user_prompt)
            state["paper_draft"] = draft
            state["result"] = {"paper_draft": draft}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="paper_writing",
                content=draft,
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)
        except Exception as exc:
            logger.error("paper_writing agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"paper_writing: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _research_planning_agent(self, state: AgentState) -> AgentState:
        try:
            query = state.get("prompt") or ""
            memory_context = await self._load_memory(state)

            system_prompt = (
                "You are the Research Planning Agent. Create a milestone-based plan with "
                "dependencies, timeline estimates, and resources."
            )

            user_prompt = (
                f"Research plan request: {query}\n\n"
                f"Context:\n{self._format_memory_context(memory_context)}\n\n"
                "Provide a plan with milestones, timeline, and dependencies."
            )

            plan = await self._call_llm(system_prompt, user_prompt)
            state["research_plan"] = {"plan": plan}
            state["result"] = {"research_plan": plan}

            artifact_id = await self._store_artifact(
                state,
                artifact_type="research_planning",
                content=plan,
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)

            await mem0_adapter.add(
                text=plan,
                user_id=state.get("user_id", ""),
                group_id=state.get("group_id"),
                memory_type="planning",
            )
        except Exception as exc:
            logger.error("research_planning agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"research_planning: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    async def _deep_research_agent(self, state: AgentState) -> AgentState:
        try:
            settings = get_settings()
            query = state.get("prompt") or ""

            plan_system = (
                "You are a research planner. Generate a focused set of search queries to answer the user question. "
                "Return a JSON array of 3-6 concise search queries."
            )
            plan_user = f"User question: {query}\nReturn JSON array only."
            plan_text = await self._call_llm(
                plan_system,
                plan_user,
                model_name=settings.research_model,
                temperature=0.2,
            )
            queries = self._parse_json_list(plan_text)
            if not queries:
                queries = [re.sub(r"@ai", "", query, flags=re.IGNORECASE).strip() or query]

            sources = await self._collect_sources(state, queries)
            state["sources"] = sources

            summaries = await self._summarize_sources(query, sources)
            state["research_plan"] = "\n".join(queries)

            compression_system = (
                "You are a research synthesizer. Combine source summaries into coherent notes. "
                "Keep citations like [S1], [S2] in the text."
            )
            compression_user = (
                f"Research question: {query}\n\n"
                f"Source summaries:\n{summaries}\n\n"
                "Produce structured notes with headings and citations."
            )
            notes = await self._call_llm(
                compression_system,
                compression_user,
                model_name=settings.compression_model,
                temperature=0.2,
            )
            state["research_notes"] = notes

            report_system = (
                "You are the Deep Research Agent. Write a comprehensive report with citations, "
                "clear sections, and actionable takeaways."
            )
            report_user = (
                f"Research question: {query}\n\n"
                f"Research notes:\n{notes}\n\n"
                "Write a report with: Executive Summary, Key Findings, Evidence & Analysis, "
                "Open Questions, and Future Directions. Keep citations like [S1]."
            )
            report = await self._call_llm(
                report_system,
                report_user,
                model_name=settings.final_report_model,
                temperature=0.2,
            )

            state["deep_research"] = report
            state["result"] = {
                "deep_research": report,
                "sources": sources,
                "research_notes": notes,
                "research_plan": queries,
            }

            artifact_id = await self._store_artifact(
                state,
                artifact_type="deep_research",
                content=report,
                metadata={"sources_count": len(sources)},
            )
            if artifact_id:
                state.setdefault("artifacts", []).append(artifact_id)
        except Exception as exc:
            logger.error("deep_research agent failed: %s", exc, exc_info=True)
            state.setdefault("errors", []).append(f"deep_research: {exc}")
            state.setdefault("result", {"error": str(exc)})

        return state

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run_task(self, task: str, request: dict) -> dict:
        if not self.is_initialized:
            self.initialize()

        if not self.is_initialized:
            raise RuntimeError("Agentic service not initialized")

        start_time = time.time()
        raw_prompt = request.get("prompt", "")
        cleaned_query = raw_prompt.lower().replace("@ai", "").strip()

        # Auto-classify intent when task_type is missing or "auto"
        effective_task = task
        if not effective_task or effective_task == "auto":
            intent, score, _phrase = classify_intent(raw_prompt)
            if intent:
                logger.info(
                    "Auto-classified intent: %s (score=%.3f)", intent, score
                )
                effective_task = intent
            else:
                logger.info(
                    "Intent classification below threshold (score=%.3f), "
                    "defaulting to literature_survey",
                    score,
                )
                effective_task = "literature_survey"

        trace_id = str(uuid.uuid4())

        initial_state: AgentState = {
            "task_type": effective_task,
            "prompt": raw_prompt,
            "query": cleaned_query or raw_prompt,
            "group_id": request.get("group_id"),
            "user_id": request.get("user_id"),
            "session_id": request.get("session_id"),
            "paper_ids": request.get("paper_ids") or [],
            "metadata": request.get("options") or {},
            "remaining_steps": [],
            "trace_id": trace_id,
        }

        logger.info(
            "[trace=%s] Starting task_type=%s", trace_id, effective_task
        )

        final_state = await self._graph.ainvoke(initial_state)
        latency_ms = int((time.time() - start_time) * 1000)

        logger.info(
            "[trace=%s] Completed task_type=%s in %dms",
            trace_id, effective_task, latency_ms,
        )

        return {
            "task_type": effective_task,
            "trace_id": trace_id,
            "result": final_state.get("result", {}),
            "artifacts": final_state.get("artifacts", []),
            "errors": final_state.get("errors", []),
            "metadata": final_state.get("metadata", {}),
            "latency_ms": latency_ms,
        }


agentic_service = AgenticService()
