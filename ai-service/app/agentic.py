"""Agentic orchestration service using LangGraph, LangChain-Groq, and Mem0."""

from __future__ import annotations

import asyncio
import logging
import time
import json
import re
import uuid
import httpx
from typing import Any, Optional, TypedDict, Annotated

logger = logging.getLogger(__name__)

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

try:
    from langgraph.prebuilt import create_react_agent
    from langchain_core.tools import tool
    from langchain_core.runnables import RunnableConfig
    from langchain_groq import ChatGroq
    from langchain_core.messages import SystemMessage, HumanMessage, AnyMessage
    from langgraph.graph.message import add_messages
    _LANGCHAIN_AVAILABLE = True
    _LANGCHAIN_IMPORT_ERROR: Optional[Exception] = None
except Exception as exc:  # pragma: no cover - optional dependency import
    create_react_agent = None  # type: ignore[assignment]
    tool = None  # type: ignore[assignment]
    ChatGroq = None  # type: ignore[assignment]
    SystemMessage = None  # type: ignore[assignment]
    HumanMessage = None  # type: ignore[assignment]
    _LANGCHAIN_AVAILABLE = False
    _LANGCHAIN_IMPORT_ERROR = exc

from .config import get_settings
from .database import database
from .vector_store import vector_store
from .intent_classifier import classify_intent
from .tools.arxiv import search_arxiv

# Default timeout for a single LLM call (seconds).
_LLM_CALL_TIMEOUT = 60

# Legacy multi-step chains removed in favor of DeepAgents dynamic subagent routing.


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
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
    """Orchestrates agentic workflows using DeepAgents."""

    def __init__(self):
        self._llm: Any = None
        self._llm_cache: dict[str, Any] = {}
        self._initialized = False
        self._api_key: Optional[str] = None
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
            temperature=0.2,
            model_name=settings.groq_model,
            api_key=settings.groq_api_key,
        )
        self._llm_cache = {settings.groq_model: self._llm}

        self._initialized = True
        logger.info("Agentic service initialized (DeepAgents)")
        return True

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    # ------------------------------------------------------------------
    # Agent construction
    # ------------------------------------------------------------------

    def _get_agent_for_task(self, effective_task: str):
        if create_react_agent is None:
            raise RuntimeError("LangGraph dependencies not available")

        primary_system_prompt = (
            "You are the Primary Orchestrator. You have access to specialized tools for "
            "various research tasks.\n\n"
            "CRITICAL RULES:\n"
            "1. YOU MUST USE YOUR TOOLS TO COMPLETE THE TASK. DO NOT ANSWER DIRECTLY FROM INTERNAL KNOWLEDGE.\n"
            "2. DO NOT CALL MULTIPLE TOOLS AT ONCE. Call ONE tool, wait for the result, then evaluate if you need to call another tool.\n"
            "3. If the user asks to find or retrieve papers, you MUST ALWAYS call `_tool_retrieve_papers` FIRST.\n"
            "4. If the user asks for a literature review, survey, or gap analysis, you MUST first call `_tool_retrieve_papers` to get the papers into the database, wait for the result, and THEN call `_tool_survey_literature`.\n"
            "5. Never hallucinate paper content."
        )

        task_tool_map = {
            "literature_survey": [self._tool_retrieve_papers, self._tool_survey_literature],
            "gap_analysis": [self._tool_retrieve_papers, self._tool_survey_literature, self._tool_analyze_gaps],
            "fact_checking": [self._tool_fact_check],
            "novelty_assessment": [self._tool_retrieve_papers, self._tool_assess_novelty],
            "research_mentor": [self._tool_provide_mentoring],
            "paper_writing": [self._tool_retrieve_papers, self._tool_write_paper_draft],
            "research_planning": [self._tool_plan_research],
            "deep_research": [self._tool_deep_research],
        }
        
        selected_tools = task_tool_map.get(effective_task) or [self._tool_retrieve_papers, self._tool_survey_literature]
        agent_tools = [tool(t) for t in selected_tools]

        return create_react_agent(
            model=self._llm,
            tools=agent_tools,
            prompt=primary_system_prompt,
        )



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

        if settings.search_api in {"mcp", "hybrid"}:
            for query in queries[: settings.max_search_queries]:
                try:
                    response = await search_arxiv(
                        query=query, limit=settings.max_search_results
                    )
                    results = response.get("papers", [])
                    for item in results:
                        _add_source(item, "arxiv")
                except Exception as exc:
                    logger.warning("Arxiv native search failed for query %r: %s", query, exc)
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
        # Memory is now handled natively by LangGraph's messages array mapping.
        return []

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
    # Agent Tools
    # ------------------------------------------------------------------

    async def _tool_retrieve_papers(self, query: str, config: RunnableConfig) -> str:
        """Search for and retrieve relevant academic papers from the database and MCP integrations based on a query."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            papers: list[dict] = []

            try:
                mcp_response = await search_arxiv(query=query, limit=10)
                papers = mcp_response.get("papers", [])
            except Exception as exc:
                logger.warning("Agentic native paper retrieval failed: %s", exc)
                papers = []

            if not papers:
                papers = await self._get_group_papers(group_id)

            summary = f"Retrieved {len(papers)} papers for query: {query}"
            if papers:
                return summary + f"\n\nPapers:\n{self._format_papers(papers)}\n"
            return summary + "\nNo papers found."
        except Exception as exc:
            logger.error("_tool_retrieve_papers failed: %s", exc, exc_info=True)
            return f"Error retrieving papers: {exc}"

    async def _tool_survey_literature(self, query: str, config: RunnableConfig) -> str:
        """Synthesize retrieved papers into a structured literature review with themes, timeline, and key contributions."""
        group_id = config.get("configurable", {}).get("group_id")
        user_id = config.get("configurable", {}).get("user_id")
        if not group_id:
            return "Error: group_id is required."

        try:
            # 1. Database Check
            papers = await self._get_group_papers(group_id)
            
            # 2. Auto-Retrieval Fallback
            if len(papers) < 3:
                logger.info(f"Only {len(papers)} papers found for group. Auto-retrieving more...")
                await self._tool_retrieve_papers(query, config)
                papers = await self._get_group_papers(group_id)

            if not papers:
                return "No papers available to survey even after retrieval attempt."

            # 3. Agentic RAG Query Generation
            query_gen_system = "You are an expert academic librarian. Break down the user's research topic into 3 to 5 highly specific search queries that will be used to retrieve relevant chunks from a vector database of research papers."
            query_gen_user = f"Topic: {query}"
            
            sub_queries = await self._call_llm_json(
                system_prompt=query_gen_system,
                user_prompt=query_gen_user,
                temperature=0.2
            )
            
            if not isinstance(sub_queries, list):
                sub_queries = [query]

            # 4. Vector Searching
            all_chunks = []
            seen_chunk_ids = set()
            
            if vector_store.is_connected:
                for sq in sub_queries:
                    results = await vector_store.search_group_vectors(
                        group_id=group_id,
                        query=str(sq),
                        limit=5
                    )
                    for res in results:
                        if res["id"] not in seen_chunk_ids:
                            seen_chunk_ids.add(res["id"])
                            all_chunks.append(res)
            
            # Format context from vector search
            context_text = ""
            if all_chunks:
                context_lines = []
                for i, chunk in enumerate(all_chunks[:15]):  # limit to top 15 distinct chunks to save tokens
                    context_lines.append(f"--- Excerpt {i+1} ---")
                    context_lines.append(f"Content: {chunk.get('content', '')}")
                context_text = "\n".join(context_lines)
            else:
                context_text = self._format_papers(papers) # fallback to full papers if vector store fails

            memory_context = await self._load_memory({"query": query, "user_id": user_id, "group_id": group_id})

            # 5. Tabular Synthesis
            system_prompt = (
                "You are an expert Academic Reviewer. Synthesize the provided paper excerpts into a comprehensive, deeply detailed structured literature review. "
                "You MUST include a Markdown table comparing the key innovations, methods, or findings of the papers discussed. "
                "Structure the review with clear thematic sections and a conclusion."
            )

            user_prompt = (
                f"User topic: {query}\n\n"
                f"Memory context:\n{self._format_memory_context(memory_context)}\n\n"
                f"Retrieved Research Excerpts:\n{context_text}\n\n"
                "Please write the detailed literature review now, ensuring to include the comparative Markdown table."
            )

            review = await self._call_llm(system_prompt, user_prompt, temperature=0.3)

            return review
        except Exception as exc:
            logger.error("_tool_survey_literature failed: %s", exc, exc_info=True)
            return f"Error surveying literature: {exc}"

    async def _tool_analyze_gaps(self, literature_review_context: str, config: RunnableConfig) -> str:
        """Identify research gaps, unresolved debates, and underexplored areas based on a given literature review."""
        group_id = config.get("configurable", {}).get("group_id")
        user_id = config.get("configurable", {}).get("user_id")
        try:
            papers = await self._get_group_papers(group_id)

            system_prompt = (
                "You are the Gap Analysis Agent. Identify research gaps, unresolved debates, "
                "and underexplored areas based on the literature review."
            )

            user_prompt = (
                f"Literature review context:\n{literature_review_context}\n\n"
                f"Papers:\n{self._format_papers(papers)}\n\n"
                "Return a prioritized list of gaps with significance and suggested approaches."
            )

            gaps_text = await self._call_llm(system_prompt, user_prompt)

            return gaps_text
        except Exception as exc:
            logger.error("_tool_analyze_gaps failed: %s", exc, exc_info=True)
            return f"Error analyzing gaps: {exc}"

    async def _tool_fact_check(self, claim: str, config: RunnableConfig) -> str:
        """Verify claims against available context. Returns supported, contradicted, or unclear with evidence."""
        group_id = config.get("configurable", {}).get("group_id")
        user_id = config.get("configurable", {}).get("user_id")
        try:
            memory_context = await self._load_memory({"query": claim, "user_id": user_id, "group_id": group_id})

            system_prompt = (
                "You are the Fact-Checking Agent. Verify claims against available context. "
                "Return supported, contradicted, or unclear with evidence."
            )

            user_prompt = (
                f"Claim to verify: {claim}\n\n"
                f"Memory context:\n{self._format_memory_context(memory_context)}\n\n"
                "Provide a verification status and evidence summary."
            )

            return await self._call_llm(system_prompt, user_prompt)
        except Exception as exc:
            logger.error("_tool_fact_check failed: %s", exc, exc_info=True)
            return f"Error fact checking: {exc}"

    async def _tool_assess_novelty(self, idea: str, config: RunnableConfig) -> str:
        """Compare an idea against existing papers and assess novelty with a score and suggestions to differentiate."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            papers = await self._get_group_papers(group_id)

            system_prompt = (
                "You are the Novelty Assessment Agent. Compare the idea against existing papers "
                "and assess novelty with a score and suggestions to differentiate."
            )

            user_prompt = (
                f"Idea: {idea}\n\n"
                f"Related papers:\n{self._format_papers(papers)}\n\n"
                "Return: novelty score (0-100), overlaps, and differentiation suggestions."
            )

            return await self._call_llm(system_prompt, user_prompt)
        except Exception as exc:
            logger.error("_tool_assess_novelty failed: %s", exc, exc_info=True)
            return f"Error assessing novelty: {exc}"

    async def _tool_provide_mentoring(self, query: str, config: RunnableConfig) -> str:
        """Provide personalized guidance, methodology advice, and next steps for a given query."""
        group_id = config.get("configurable", {}).get("group_id")
        user_id = config.get("configurable", {}).get("user_id")
        try:
            memory_context = await self._load_memory({"query": query, "user_id": user_id, "group_id": group_id})

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

            return advice
        except Exception as exc:
            logger.error("_tool_provide_mentoring failed: %s", exc, exc_info=True)
            return f"Error providing mentoring: {exc}"

    async def _tool_write_paper_draft(self, paper_request: str, config: RunnableConfig) -> str:
        """Draft a structured paper outline and key sections aligned with academic standards based on a request and retrieved papers."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            papers = await self._get_group_papers(group_id)

            system_prompt = (
                "You are the Paper Writing Agent. Draft a structured paper outline and "
                "key sections aligned with academic standards."
            )

            user_prompt = (
                f"Paper request: {paper_request}\n\n"
                f"Reference papers:\n{self._format_papers(papers)}\n\n"
                "Provide: title, abstract, outline, and a starter introduction."
            )

            return await self._call_llm(system_prompt, user_prompt)
        except Exception as exc:
            logger.error("_tool_write_paper_draft failed: %s", exc, exc_info=True)
            return f"Error writing paper draft: {exc}"

    async def _tool_plan_research(self, request: str, config: RunnableConfig) -> str:
        """Create a milestone-based plan with dependencies, timeline estimates, and resources for a given research request."""
        group_id = config.get("configurable", {}).get("group_id")
        user_id = config.get("configurable", {}).get("user_id")
        try:
            memory_context = await self._load_memory({"query": request, "user_id": user_id, "group_id": group_id})

            system_prompt = (
                "You are the Research Planning Agent. Create a milestone-based plan with "
                "dependencies, timeline estimates, and resources."
            )

            user_prompt = (
                f"Research plan request: {request}\n\n"
                f"Context:\n{self._format_memory_context(memory_context)}\n\n"
                "Provide a plan with milestones, timeline, and dependencies."
            )

            plan = await self._call_llm(system_prompt, user_prompt)

            return plan
        except Exception as exc:
            logger.error("_tool_plan_research failed: %s", exc, exc_info=True)
            return f"Error planning research: {exc}"

    async def _tool_deep_research(self, query: str, config: RunnableConfig) -> str:
        """Conduct deep research into a query by generating sub-queries, gathering sources, synthesizing notes, and writing a comprehensive final report."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            settings = get_settings()

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

            # Collect sources dynamically using the internal state-less helper
            sources = await self._collect_sources_internal(queries, group_id)

            summaries = await self._summarize_sources(query, sources)

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

            return f"Deep Research Report:\n\n{report}"
        except Exception as exc:
            logger.error("_tool_deep_research failed: %s", exc, exc_info=True)
            return f"Error in deep research: {exc}"

    async def _collect_sources_internal(self, queries: list[str], group_id: Optional[str] = None) -> list[dict]:
        """A helper method for deep research tool to collect sources independent of graph state."""
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

        if settings.search_api in {"mcp", "hybrid"}:
            for query in queries[: settings.max_search_queries]:
                try:
                    response = await search_arxiv(
                        query=query, limit=settings.max_search_results
                    )
                    results = response.get("papers", [])
                    for item in results:
                        _add_source(item, "arxiv")
                except Exception as exc:
                    logger.warning("Arxiv native search failed for query %r: %s", query, exc)
                    continue

        if settings.search_api in {"vector_store", "hybrid"} and vector_store.is_connected:
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
            papers = await self._get_group_papers(group_id)
            for paper in papers[: settings.max_search_results]:
                _add_source(paper, "group_papers")

        return sources

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

        logger.info(
            "[trace=%s] Starting task_type=%s", trace_id, effective_task
        )

        user_content = (
            f"User request: {raw_prompt}\n\n"
            f"The identified overall objective is '{effective_task}'. "
            f"You MUST use your tools to accomplish this. Do not write the final response until you have used the tools (e.g. use `_tool_retrieve_papers` FIRST, and then `{'_tool_' + effective_task}` if applicable).\n\n"
            f"<context>\n"
            f"Group ID: {request.get('group_id')}\n"
            f"User ID: {request.get('user_id')}\n"
            f"</context>\n"
        )
        if request.get("paper_ids"):
            user_content += f"Specific Target Paper IDs: {request.get('paper_ids')}\n"

        initial_input = {
            "messages": [{"role": "user", "content": user_content}]
        }

        agent = self._get_agent_for_task(effective_task)

        try:
            # Note: create_react_agent returns an agent that supports .invoke() or .ainvoke()
            final_state = await agent.ainvoke(
                initial_input,
                config={
                    "configurable": {
                        "group_id": request.get("group_id"),
                        "user_id": request.get("user_id")
                    }
                }
            )
            
            # DeepAgents stores the conversation history in `messages`. 
            # We extract the final AI message content as the result.
            messages = final_state.get("messages", [])
            final_response = "Task completed, but no response was generated."
            if messages and hasattr(messages[-1], "content"):
                final_response = messages[-1].content
            elif messages and isinstance(messages[-1], dict):
                final_response = messages[-1].get("content", final_response)
                
            errors = []
            
        except Exception as exc:
            logger.error("DeepAgent execution failed: %s", exc, exc_info=True)
            final_response = f"Execution failed: {exc}"
            errors = [str(exc)]

        latency_ms = int((time.time() - start_time) * 1000)

        logger.info(
            "[trace=%s] Completed task_type=%s in %dms",
            trace_id, effective_task, latency_ms,
        )

        return {
            "task_type": effective_task,
            "trace_id": trace_id,
            "result": {"final_response": final_response},
            "artifacts": [], # Artifacts are now primarily handled via memory context inserts within tools 
            "errors": errors,
            "metadata": request.get("options") or {},
            "latency_ms": latency_ms,
        }


agentic_service = AgenticService()
