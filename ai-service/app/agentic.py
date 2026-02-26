"""Agentic orchestration service using LangGraph and LangChain-Groq."""

from __future__ import annotations

import asyncio
import copy
import logging
import time
import json
import re
import uuid
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
from .reranker import reranker
from .intent_classifier import classify_intent
from .tools.arxiv import search_arxiv
from .tools.web_search import search_web

# Default timeout for a single LLM call (seconds).
_LLM_CALL_TIMEOUT = 60


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
    result: dict
    artifacts: list[str]
    metadata: dict
    errors: list[str]
    remaining_steps: list[str]
    trace_id: str


class AgenticService:
    """Orchestrates agentic workflows using LangGraph ReAct agents."""

    def __init__(self):
        self._llm: Any = None
        self._llm_cache: dict[str, Any] = {}
        self._initialized = False
        self._api_key: Optional[str] = None

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
        logger.info("Agentic service initialized")
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
            "fact_check": [self._tool_fact_check],
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
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                if attempt == 2:
                    return raw
                continue

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

    def _extract_text_from_possible_json(self, text: str) -> str:
        """Helper to extract text if the model wraps final output in JSON."""
        if not isinstance(text, str):
            return str(text)
        
        # Try parsing directly
        try:
            parsed = json.loads(text.strip())
            if isinstance(parsed, dict):
                if "final_response" in parsed:
                    return parsed["final_response"]
                if "response" in parsed:
                    return parsed["response"]
        except Exception:
            pass
        
        # Try finding markdown JSON blocks
        m = re.match(r"^```(?:json)?\s*(\{.*?\})\s*```$", text.strip(), re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(1))
                if isinstance(parsed, dict):
                    if "final_response" in parsed:
                        return parsed["final_response"]
                    if "response" in parsed:
                        return parsed["response"]
            except Exception:
                pass
                
        return text

    # ------------------------------------------------------------------
    # Source collection (single unified method)
    # ------------------------------------------------------------------

    async def _collect_sources(self, queries: list[str], group_id: Optional[str] = None) -> list[dict]:
        """Collect sources from arXiv and vector store for the given queries."""
        settings = get_settings()
        sources: list[dict] = []
        max_results = 10

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

        # arXiv search
        for query in queries[:5]:
            try:
                response = await search_arxiv(query=query, limit=max_results)
                results = response.get("papers", [])
                for item in results:
                    _add_source(item, "arxiv")
            except Exception as exc:
                logger.warning("Arxiv search failed for query %r: %s", query, exc)
                continue

        # Vector store search
        if vector_store.is_connected and group_id:
            for query in queries[:5]:
                try:
                    results = await vector_store.search_group_vectors(
                        group_id=group_id,
                        query=query,
                        limit=max_results,
                        content_types=None,
                        paper_id=None,
                    )
                    for item in results:
                        _add_source(item, "vector_store")
                except Exception as exc:
                    logger.warning("Vector store search failed for query %r: %s", query, exc)
                    continue

        # Fallback to group papers if no sources found
        if not sources:
            papers = await self._get_group_papers(group_id)
            for paper in papers[:max_results]:
                _add_source(paper, "group_papers")

        return sources

    async def _summarize_sources(self, query: str, sources: list[dict]) -> str:
        """Summarize sources concurrently using asyncio.gather."""

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
                    temperature=0.2,
                )
                return f"[S{idx}] {title}\n{summary.strip()}"
            except Exception as exc:
                logger.warning("Failed to summarize source %d (%s): %s", idx, title, exc)
                return f"[S{idx}] {title}\n(summary unavailable)"

        max_summaries = 10
        tasks = [
            _summarize_one(idx, source)
            for idx, source in enumerate(sources[:max_summaries], start=1)
        ]
        summaries = await asyncio.gather(*tasks)
        return "\n\n".join(summaries)

    # ------------------------------------------------------------------
    # Artifact helpers
    # ------------------------------------------------------------------

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

    async def _filter_relevant_items(
        self,
        query: str,
        items: list[dict],
        title_key: str = "title",
        content_key: str = "content",
        time_constraint: str = "None",
    ) -> list[dict]:
        """Use LLM to filter items by relevance to the query and time constraint.

        Asks the model to return the 1-based indices of items that are
        **directly** relevant.  Falls back to returning everything if
        the LLM call or parsing fails.
        """
        if not items:
            return []

        # Build numbered list for the LLM
        settings = get_settings()
        max_items = settings.rag_relevance_filter_max_items
        numbered = []
        for i, item in enumerate(items[:max_items]):
            title = item.get(title_key, "Untitled")
            snippet = (item.get(content_key, "") or item.get("abstract", ""))[:200]
            date_str = item.get("published_date") or item.get("published") or item.get("added_at") or "Unknown"
            numbered.append(f"{i + 1}. {title} (Date: {date_str}): {snippet}")
        paper_list = "\n".join(numbered)

        system_prompt = (
            "You are a strict research-relevance classifier. "
            "Given a research topic, a time constraint, and a numbered list of papers/excerpts, "
            "return ONLY a JSON array of the numbers whose content is "
            "DIRECTLY relevant to the topic AND falls within the time constraint. "
            "Be extremely strict — do NOT include papers on unrelated subjects even if they share broad ML/AI terminology, "
            "and absolutely EXCLUDE papers whose explicitly stated publication date falls outside the exact requested time frame. "
            "If NONE are relevant, return an empty array [].\n"
            "Example response: [1, 3, 5]"
        )
        user_prompt = f"Topic: {query}\nTime Constraint: {time_constraint}\n\nPapers:\n{paper_list}"

        try:
            result = await self._call_llm_json(
                system_prompt, user_prompt, temperature=0.1,
            )
            if isinstance(result, list):
                valid = set()
                for v in result:
                    try:
                        idx = int(v) - 1
                        if 0 <= idx < len(items):
                            valid.add(idx)
                    except (ValueError, TypeError):
                        continue
                filtered = [items[i] for i in sorted(valid)]
                logger.info(
                    "Relevance filter: %d/%d items kept for query %r (Time: %s)",
                    len(filtered), len(items), query[:80], time_constraint
                )
                return filtered
        except Exception as exc:
            logger.warning("Relevance filter LLM call failed: %s", exc)

        return items  # fallback: don't drop anything

    # ------------------------------------------------------------------
    # Shared RAG + Web Search helpers
    # ------------------------------------------------------------------

    async def _gather_context(
        self,
        query: str,
        sub_queries: list[str],
        group_id: Optional[str],
        include_web: bool = True,
        include_arxiv: bool = True,
    ) -> tuple[str, list[dict]]:
        """
        Collect sources from vector store, web search, and arXiv.

        Returns:
            (context_text, source_registry)
            source_registry: list of {id, title, url, type, snippet}
        """
        source_registry: list[dict] = []
        seen_urls: set[str] = set()
        sid = 0

        def _add(title: str, url: str, snippet: str, src_type: str):
            nonlocal sid
            if url and url in seen_urls:
                return
            if url:
                seen_urls.add(url)
            sid += 1
            source_registry.append({
                "id": f"S{sid}",
                "title": title or "Untitled",
                "url": url or "",
                "type": src_type,
                "snippet": snippet[:500] if snippet else "",
            })

        # 1) Vector store search (hybrid: vector + BM25 + RRF)
        if vector_store.is_connected and group_id:
            for sq in sub_queries[:5]:
                try:
                    results = await vector_store.hybrid_search_group_vectors(
                        group_id=group_id, query=str(sq), limit=5
                    )
                    for res in results:
                        _add(
                            title=res.get("title", res.get("paper_id", "DB Chunk")),
                            url=res.get("url", ""),
                            snippet=res.get("content", ""),
                            src_type="vector_store",
                        )
                except Exception as exc:
                    logger.warning("Hybrid search failed for %r: %s", sq, exc)

        # 2) Web search
        if include_web:
            for sq in sub_queries[:3]:
                try:
                    web_results = await search_web(query=str(sq), limit=3)
                    for item in web_results.get("results", []):
                        _add(
                            title=item.get("title", ""),
                            url=item.get("url", ""),
                            snippet=item.get("snippet", ""),
                            src_type="web",
                        )
                except Exception as exc:
                    logger.warning("Web search failed for %r: %s", sq, exc)

        # 3) ArXiv search
        if include_arxiv:
            for sq in sub_queries[:3]:
                try:
                    ax_resp = await search_arxiv(query=str(sq), limit=3)
                    for item in ax_resp.get("papers", []):
                        _add(
                            title=item.get("title", ""),
                            url=item.get("url", item.get("id", "")),
                            snippet=item.get("abstract", ""),
                            src_type="arxiv",
                        )
                except Exception as exc:
                    logger.warning("ArXiv search failed for %r: %s", sq, exc)

        # 4) Fallback to group papers if nothing found
        if not source_registry and group_id:
            papers = await self._get_group_papers(group_id)
            for paper in papers[:8]:
                _add(
                    title=paper.get("title", "Untitled"),
                    url=paper.get("url", ""),
                    snippet=paper.get("abstract", ""),
                    src_type="group_papers",
                )

        # 5) Cross-encoder reranking — reorder by true relevance
        if len(source_registry) > 1 and reranker.is_available:
            try:
                source_registry = await reranker.rerank(
                    query=query,
                    results=source_registry,
                    top_k=min(len(source_registry), 15),
                    content_key="snippet",
                )
            except Exception as exc:
                logger.warning("Reranking failed: %s", exc)

        # Build context text
        context_lines = []
        for src in source_registry:
            context_lines.append(f"--- [{src['id']}] {src['title']} ({src['type']}) ---")
            context_lines.append(src["snippet"])
            if src["url"]:
                context_lines.append(f"URL: {src['url']}")
            context_lines.append("")

        context_text = "\n".join(context_lines) if context_lines else "No external context found."
        return context_text, source_registry

    def _resolve_references(self, text: str, sources: list[dict]) -> str:
        """
        Replace [S1], [S2] etc. in LLM output with clickable markdown links.

        Example: [S1] → [Smith et al. — "Title"](https://arxiv.org/abs/...)
        """
        for src in sources:
            marker = f"[{src['id']}]"
            if marker not in text:
                continue
            title = src["title"][:60]
            url = src["url"]
            if url:
                replacement = f"[{title}]({url})"
            else:
                replacement = f"*{title}*"
            text = text.replace(marker, replacement)
        return text

    def _build_reference_section(self, sources: list[dict]) -> str:
        """Build a ## References section with numbered clickable links."""
        if not sources:
            return ""
        lines = ["\n\n## References\n"]
        for i, src in enumerate(sources, 1):
            title = src["title"]
            url = src["url"]
            src_type = src["type"]
            if url:
                lines.append(f"{i}. [{title}]({url}) — *{src_type}*")
            else:
                lines.append(f"{i}. {title} — *{src_type}*")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Agent Tools
    # ------------------------------------------------------------------

    async def _tool_retrieve_papers(self, query: str, config: RunnableConfig) -> str:
        """Search for relevant academic papers from arXiv (read-only, no auto-save to group)."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            papers: list[dict] = []

            # Search arXiv — results are returned as context only, NOT persisted
            try:
                mcp_response = await search_arxiv(query=query, limit=10)
                arxiv_papers = mcp_response.get("papers", [])
                papers.extend(arxiv_papers)
            except Exception as exc:
                logger.warning("ArXiv search failed: %s", exc)

            # Fall back to existing group papers if arXiv returned nothing
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
        """Synthesize retrieved papers into a structured literature review."""
        group_id = config.get("configurable", {}).get("group_id")
        if not group_id:
            return "Error: group_id is required."

        # Generate sub-queries for RAG and ArXiv
        query_gen_system = (
            "You are an expert academic librarian. Extract a clean arXiv search query, 3-5 specific vector "
            "database sub-queries, and any explicit time constraints (e.g. 'past 2 years', 'since 2021', "
            "or 'None') from the user's research topic. \n"
            "Return ONLY a JSON object with this exact structure:\n"
            '{"arxiv_query": "clean keywords only", "vector_queries": ["query1", "query2"], "time_constraint": "None"}'
        )
        query_data = await self._call_llm_json(
            system_prompt=query_gen_system,
            user_prompt=f"Topic: {query}",
            temperature=0.2,
        )
        
        # Default fallbacks if parsing fails
        arxiv_query = query
        sub_queries = [query]
        time_constraint = "None"
        
        if isinstance(query_data, dict):
            arxiv_query = query_data.get("arxiv_query", query)
            sub_queries = query_data.get("vector_queries", [query])
            time_constraint = query_data.get("time_constraint", "None")

        try:
            papers = await self._get_group_papers(group_id)
            arxiv_papers_fetched = []
            if len(papers) < 3:
                logger.info("Only %d papers found, auto-retrieving more from arXiv...", len(papers))
                try:
                    mcp_response = await search_arxiv(query=arxiv_query, limit=10)
                    arxiv_papers_fetched = mcp_response.get("papers", [])
                    if arxiv_papers_fetched:
                        logger.info("Successfully fetched %d papers from arXiv.", len(arxiv_papers_fetched))
                        # Append the fetched arXiv papers to the in-memory papers list
                        papers.extend(arxiv_papers_fetched)
                except Exception as exc:
                    logger.warning("Auto-retrieve from ArXiv failed: %s", exc)

            if not papers:
                return "No papers available to survey even after retrieval attempt."

        except Exception as exc:
            logger.error("Failed to retrieve papers: %s", exc)
            return "Error retrieving papers."

        # Vector search for relevant chunks
        all_chunks = []
        seen_chunk_ids = set()

        # Inject the dynamically fetched arXiv papers as high-priority chunks
        for i, p in enumerate(arxiv_papers_fetched):
            chunk_id = f"arxiv_auto_{i}"
            seen_chunk_ids.add(chunk_id)
            all_chunks.append({
                "id": chunk_id,
                "paper_id": p.get("title", "ArXiv Paper"),
                "content": f"{p.get('title', '')}\n{p.get('abstract', '')}\nPublished: {p.get('published', 'Unknown')}",
                "similarity": 1.0,
                "url": p.get("url", "")
            })

        settings = get_settings()
        if vector_store.is_connected:
            for sq in sub_queries:
                results = await vector_store.search_group_vectors(
                    group_id=group_id,
                    query=str(sq),
                    limit=settings.rag_chunks_per_query,
                )
                for res in results:
                    if res["id"] not in seen_chunk_ids:
                        # Skip chunks with very low vector similarity
                        similarity = res.get("similarity", 0)
                        if similarity < settings.rag_similarity_threshold:
                            continue
                        seen_chunk_ids.add(res["id"])
                        all_chunks.append(res)

        # Rerank chunks using cross-encoder if available
        if len(all_chunks) > 1 and reranker.is_available:
            try:
                all_chunks = await reranker.rerank(
                    query=query,
                    results=all_chunks,
                    top_k=min(len(all_chunks), settings.rag_reranker_top_k),
                    content_key="content",
                )
                all_chunks = [c for c in all_chunks if c.get("rerank_score", 0) > settings.rag_reranker_score_threshold]
            except Exception as exc:
                logger.warning("Reranking literature chunks failed: %s", exc)

        if all_chunks:
            all_chunks = await self._filter_relevant_items(
                query=query, items=all_chunks,
                title_key="paper_id", content_key="content",
                time_constraint=time_constraint,
            )

        if all_chunks:
            context_lines = []
            for i, chunk in enumerate(all_chunks[:settings.rag_max_context_chunks]):
                context_lines.append(f"--- Excerpt {i+1} ---")
                context_lines.append(f"Content: {chunk.get('content', '')}")
            context_text = "\n".join(context_lines)
        else:
            # Fallback: filter group papers by LLM relevance
            paper_items = [
                {
                    "title": p.get("title", "Untitled"),
                    "content": f"{p.get('title', '')} {p.get('abstract', '')}",
                }
                for p in papers
            ]
            paper_items = await self._filter_relevant_items(
                query=query, items=paper_items,
                title_key="title", content_key="content",
            )

            if paper_items:
                context_text = "\n".join(
                    f"- {p['title']}: {p['content'][:400]}" for p in paper_items
                )
            else:
                context_text = (
                    "No papers in the current group are relevant to this topic. "
                    "The review should state that no relevant papers were found "
                    "and suggest the user add papers on this topic to the group."
                )

        system_prompt = (
            "You are an expert Academic Reviewer. Synthesize the provided paper excerpts into a comprehensive, deeply detailed structured literature review. "
            "You MUST include a Markdown table comparing the key innovations, methods, or findings of the papers discussed. "
            "Structure the review with clear thematic sections and a conclusion."
        )

        user_prompt = (
            f"User topic: {query}\n\n"
            f"Retrieved Research Excerpts:\n{context_text}\n\n"
            "Please write the detailed literature review now, ensuring to include the comparative Markdown table."
        )

        return await self._call_llm(system_prompt, user_prompt, temperature=0.3)

    async def _tool_analyze_gaps(self, literature_review_context: str, config: RunnableConfig) -> str:
        """Identify research gaps, unresolved debates, and underexplored areas."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            # Generate sub-queries for gap analysis
            sub_queries = await self._call_llm_json(
                system_prompt="You are a research strategist. Generate 3-5 focused search queries to find potential research gaps, underexplored areas, and recent developments related to the topic. Return a JSON array of strings.",
                user_prompt=f"Topic context:\n{literature_review_context[:2000]}",
                temperature=0.2,
            )
            if not isinstance(sub_queries, list):
                sub_queries = [literature_review_context[:200]]

            context_text, sources = await self._gather_context(
                query=literature_review_context[:500],
                sub_queries=sub_queries,
                group_id=group_id,
            )

            system_prompt = (
                "You are the Gap Analysis Agent. Identify research gaps, unresolved debates, "
                "and underexplored areas based on the provided context.\n\n"
                "RULES:\n"
                "1. Cite sources using [S1], [S2], etc.\n"
                "2. Rate each gap: 🔴 High / 🟡 Medium / 🟢 Low significance\n"
                "3. Suggest concrete approaches for each gap with supporting references\n"
                "4. Structure output with clear numbered gaps\n"
                "5. Be thorough and detailed"
            )
            user_prompt = (
                f"Literature review context:\n{literature_review_context[:3000]}\n\n"
                f"Additional sources:\n{context_text}\n\n"
                "Identify and analyze all research gaps with citations."
            )

            raw = await self._call_llm(system_prompt, user_prompt)
            result = self._resolve_references(raw, sources)
            result += self._build_reference_section(sources)
            return result
        except Exception as exc:
            logger.error("_tool_analyze_gaps failed: %s", exc, exc_info=True)
            return f"Error analyzing gaps: {exc}"

    async def _tool_fact_check(self, claim: str, config: RunnableConfig) -> str:
        """Verify claims against available context. Returns supported, contradicted, or unclear with evidence."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            # Generate search queries to verify the claim
            sub_queries = await self._call_llm_json(
                system_prompt="You are a fact-checking strategist. Generate 3-5 search queries to find evidence that supports or contradicts the given claim. Return a JSON array of strings.",
                user_prompt=f"Claim to verify: {claim}",
                temperature=0.2,
            )
            if not isinstance(sub_queries, list):
                sub_queries = [claim]

            context_text, sources = await self._gather_context(
                query=claim,
                sub_queries=sub_queries,
                group_id=group_id,
            )

            system_prompt = (
                "You are the Fact-Checking Agent. Verify the claim against the provided evidence.\n\n"
                "RULES:\n"
                "1. Cite all evidence using [S1], [S2], etc.\n"
                "2. For each sub-claim classify as: ✅ Supported / ❌ Contradicted / ⚠️ Unclear\n"
                "3. Provide a confidence level (High/Medium/Low) with justification\n"
                "4. Quote specific evidence from sources\n"
                "5. Structure output clearly with a final verdict"
            )
            user_prompt = (
                f"Claim to verify: {claim}\n\n"
                f"Available evidence:\n{context_text}\n\n"
                "Provide a thorough fact-check with evidence citations."
            )

            raw = await self._call_llm(system_prompt, user_prompt)
            result = self._resolve_references(raw, sources)
            result += self._build_reference_section(sources)
            return result
        except Exception as exc:
            logger.error("_tool_fact_check failed: %s", exc, exc_info=True)
            return f"Error fact checking: {exc}"

    async def _tool_assess_novelty(self, idea: str, config: RunnableConfig) -> str:
        """Compare an idea against existing papers and assess novelty."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            # Generate search queries for prior art
            sub_queries = await self._call_llm_json(
                system_prompt="You are a novelty assessment strategist. Generate 3-5 search queries to find existing work similar to the idea. Aim to find overlapping research. Return a JSON array of strings.",
                user_prompt=f"Idea to assess: {idea}",
                temperature=0.2,
            )
            if not isinstance(sub_queries, list):
                sub_queries = [idea]

            context_text, sources = await self._gather_context(
                query=idea,
                sub_queries=sub_queries,
                group_id=group_id,
            )

            system_prompt = (
                "You are the Novelty Assessment Agent. Compare the idea against existing work.\n\n"
                "RULES:\n"
                "1. Cite all related work using [S1], [S2], etc.\n"
                "2. Provide a novelty score (0-100) with detailed justification\n"
                "3. List specific overlaps with existing work (cite sources)\n"
                "4. Identify the unique contributions of the idea\n"
                "5. Suggest differentiation strategies with references\n"
                "6. Use a structured format with clear sections"
            )
            user_prompt = (
                f"Idea to assess: {idea}\n\n"
                f"Existing work found:\n{context_text}\n\n"
                "Provide a comprehensive novelty assessment with citations."
            )

            raw = await self._call_llm(system_prompt, user_prompt)
            result = self._resolve_references(raw, sources)
            result += self._build_reference_section(sources)
            return result
        except Exception as exc:
            logger.error("_tool_assess_novelty failed: %s", exc, exc_info=True)
            return f"Error assessing novelty: {exc}"

    async def _tool_provide_mentoring(self, query: str, config: RunnableConfig) -> str:
        """Provide personalized guidance, methodology advice, and next steps."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            # Generate search queries for resources
            sub_queries = await self._call_llm_json(
                system_prompt="You are a research mentor. Generate 3-5 search queries to find helpful resources, methodologies, tutorials, and seminal papers for the student's question. Return a JSON array of strings.",
                user_prompt=f"Student question: {query}",
                temperature=0.2,
            )
            if not isinstance(sub_queries, list):
                sub_queries = [query]

            context_text, sources = await self._gather_context(
                query=query,
                sub_queries=sub_queries,
                group_id=group_id,
            )

            system_prompt = (
                "You are the Research Mentor Agent. Provide detailed, actionable guidance.\n\n"
                "RULES:\n"
                "1. Cite resources using [S1], [S2], etc.\n"
                "2. Recommend seminal papers with proper citations\n"
                "3. Suggest specific methodologies with references\n"
                "4. Provide step-by-step next actions\n"
                "5. Include recommended tools, datasets, or frameworks with links\n"
                "6. Be encouraging but rigorous"
            )
            user_prompt = (
                f"Student query: {query}\n\n"
                f"Available resources:\n{context_text}\n\n"
                "Provide comprehensive mentoring advice with cited resources."
            )

            raw = await self._call_llm(system_prompt, user_prompt)
            result = self._resolve_references(raw, sources)
            result += self._build_reference_section(sources)
            return result
        except Exception as exc:
            logger.error("_tool_provide_mentoring failed: %s", exc, exc_info=True)
            return f"Error providing mentoring: {exc}"

    async def _tool_write_paper_draft(self, paper_request: str, config: RunnableConfig) -> str:
        """Draft a structured paper outline and key sections."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            # Generate queries for reference gathering
            sub_queries = await self._call_llm_json(
                system_prompt="You are an academic writing assistant. Generate 3-5 search queries to find reference material for the paper topic. Return a JSON array of strings.",
                user_prompt=f"Paper topic: {paper_request}",
                temperature=0.2,
            )
            if not isinstance(sub_queries, list):
                sub_queries = [paper_request]

            context_text, sources = await self._gather_context(
                query=paper_request,
                sub_queries=sub_queries,
                group_id=group_id,
            )

            system_prompt = (
                "You are the Paper Writing Agent. Draft a structured academic paper.\n\n"
                "RULES:\n"
                "1. Include inline citations using [S1], [S2], etc.\n"
                "2. Produce: Title, Abstract, Introduction (with background & citations), "
                "Related Work, Proposed Approach/Outline, and Conclusion\n"
                "3. Cite relevant sources throughout the text\n"
                "4. Follow academic writing conventions\n"
                "5. Make the introduction thorough with proper literature context"
            )
            user_prompt = (
                f"Paper topic: {paper_request}\n\n"
                f"Reference material:\n{context_text}\n\n"
                "Write the structured paper draft with inline citations."
            )

            raw = await self._call_llm(system_prompt, user_prompt)
            result = self._resolve_references(raw, sources)
            result += self._build_reference_section(sources)
            return result
        except Exception as exc:
            logger.error("_tool_write_paper_draft failed: %s", exc, exc_info=True)
            return f"Error writing paper draft: {exc}"

    async def _tool_plan_research(self, request: str, config: RunnableConfig) -> str:
        """Create a milestone-based plan with dependencies, timeline estimates, and resources."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            # Generate queries for methodology & best practices search
            sub_queries = await self._call_llm_json(
                system_prompt="You are a research planning strategist. Generate 3-5 search queries to find methodologies, best practices, tools, and existing approaches for the research plan. Return a JSON array of strings.",
                user_prompt=f"Research plan request: {request}",
                temperature=0.2,
            )
            if not isinstance(sub_queries, list):
                sub_queries = [request]

            context_text, sources = await self._gather_context(
                query=request,
                sub_queries=sub_queries,
                group_id=group_id,
            )

            system_prompt = (
                "You are the Research Planning Agent. Create a comprehensive, milestone-based plan.\n\n"
                "RULES:\n"
                "1. Cite methodologies and resources using [S1], [S2], etc.\n"
                "2. Include: Milestones with timeline estimates, dependencies between tasks,\n"
                "   recommended tools/datasets (with links), potential risks\n"
                "3. Link each milestone to relevant references\n"
                "4. Be specific and actionable\n"
                "5. Include a Gantt-chart style text timeline"
            )
            user_prompt = (
                f"Research plan request: {request}\n\n"
                f"Available methodologies and resources:\n{context_text}\n\n"
                "Create the detailed research plan with referenced resources."
            )

            raw = await self._call_llm(system_prompt, user_prompt)
            result = self._resolve_references(raw, sources)
            result += self._build_reference_section(sources)
            return result
        except Exception as exc:
            logger.error("_tool_plan_research failed: %s", exc, exc_info=True)
            return f"Error planning research: {exc}"

    async def _tool_deep_research(self, query: str, config: RunnableConfig) -> str:
        """Conduct deep research by generating sub-queries, gathering sources, and writing a comprehensive report."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            # Step 1: Generate search queries
            plan_system = (
                "You are a research planner. Generate a focused set of search queries to answer the user question. "
                "Return a JSON array of 4-6 concise, diverse search queries."
            )
            plan_text = await self._call_llm(
                plan_system,
                f"User question: {query}\nReturn JSON array only.",
                temperature=0.2,
            )
            queries = self._parse_json_list(plan_text)
            if not queries:
                queries = [re.sub(r"@ai", "", query, flags=re.IGNORECASE).strip() or query]

            # Step 2: Gather sources from all channels
            context_text, sources = await self._gather_context(
                query=query,
                sub_queries=queries,
                group_id=group_id,
                include_web=True,
                include_arxiv=True,
            )

            # Step 3: Summarize sources
            summaries = await self._summarize_sources(query, [
                {"title": s["title"], "content": s["snippet"], "url": s["url"]}
                for s in sources
            ])

            # Step 4: Synthesize notes
            compression_system = (
                "You are a research synthesizer. Combine source summaries into coherent notes. "
                "Keep citations like [S1], [S2] in the text."
            )
            notes = await self._call_llm(
                compression_system,
                f"Research question: {query}\n\nSource summaries:\n{summaries}\n\n"
                "Produce structured notes with headings and citations.",
                temperature=0.2,
            )

            # Step 5: Write final report
            report_system = (
                "You are the Deep Research Agent. Write a comprehensive report.\n\n"
                "RULES:\n"
                "1. Use citations [S1], [S2], etc. throughout the text\n"
                "2. Include: Executive Summary, Key Findings, Evidence & Analysis, "
                "Open Questions, and Future Directions\n"
                "3. Be thorough, detailed, and evidence-based\n"
                "4. Each claim must be backed by a citation"
            )
            report = await self._call_llm(
                report_system,
                f"Research question: {query}\n\nResearch notes:\n{notes}\n\n"
                "Write the comprehensive report with citations.",
                temperature=0.2,
            )

            result = self._resolve_references(report, sources)
            result += self._build_reference_section(sources)
            return f"Deep Research Report:\n\n{result}"
        except Exception as exc:
            logger.error("_tool_deep_research failed: %s", exc, exc_info=True)
            return f"Error in deep research: {exc}"

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
            final_state = await agent.ainvoke(
                initial_input,
                config={
                    "configurable": {
                        "group_id": request.get("group_id"),
                        "user_id": request.get("user_id")
                    }
                }
            )

            messages = final_state.get("messages", [])
            final_response = "Task completed, but no response was generated."
            if messages and hasattr(messages[-1], "content"):
                final_response = self._extract_text_from_possible_json(messages[-1].content)
            elif messages and isinstance(messages[-1], dict):
                final_response = self._extract_text_from_possible_json(messages[-1].get("content", final_response))

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

        key_map = {
            "deep_research": "deep_research",
            "literature_survey": "literature_review",
            "gap_analysis": "research_gaps",
            "fact_check": "fact_check",
            "novelty_assessment": "novelty",
            "research_mentor": "mentor_advice",
            "paper_writing": "paper_draft",
            "research_planning": "research_plan",
        }
        result_key = key_map.get(effective_task, "result")

        return {
            "task_type": effective_task,
            "trace_id": trace_id,
            "result": {result_key: final_response},
            "artifacts": [],
            "errors": errors,
            "metadata": request.get("options") or {},
            "latency_ms": latency_ms,
        }

    async def stream_task_events(self, task: str, request: dict):
        if not self.is_initialized:
            self.initialize()
            if not self.is_initialized:
                yield json.dumps({"type": "error", "error": "Agentic service not initialized"}) + "\n"
                return

        start_time = time.time()
        raw_prompt = request.get("prompt", "")

        effective_task = task
        if not effective_task or effective_task == "auto":
            intent, score, _phrase = classify_intent(raw_prompt)
            if intent:
                logger.info("Auto-classified intent: %s (score=%.3f)", intent, score)
                effective_task = intent
            else:
                effective_task = "literature_survey"

        trace_id = str(uuid.uuid4())
        logger.info("[trace=%s] Starting stream_task_events for %s", trace_id, effective_task)

        user_content = (
            f"User request: {raw_prompt}\n\n"
            f"The identified overall objective is '{effective_task}'. "
            f"You MUST use your tools to accomplish this. Do not write the final response until you have used the tools.\n\n"
            f"<context>\n"
            f"Group ID: {request.get('group_id')}\n"
            f"User ID: {request.get('user_id')}\n"
            f"</context>\n"
        )
        if request.get("paper_ids"):
            user_content += f"Specific Target Paper IDs: {request.get('paper_ids')}\n"

        initial_input = {"messages": [{"role": "user", "content": user_content}]}
        agent = self._get_agent_for_task(effective_task)

        final_response = "Task completed, but no response was generated."
        errors = []

        try:
            if effective_task == "literature_survey":
                group_id = request.get("group_id")
                query = raw_prompt
                
                steps = [
                    {"icon": "search", "label": "Processing research query", "status": "active", "detail": "Extracting key terms..."},
                    {"icon": "database", "label": "Searching distinct papers in DB", "status": "pending", "detail": ""},
                    {"icon": "globe", "label": "Searching Arxiv", "status": "pending", "detail": ""},
                    {"icon": "layers", "label": "Retrieving context chunks", "status": "pending", "detail": ""},
                    {"icon": "brain", "label": "Synthesizing literature review", "status": "pending", "detail": ""}
                ]

                def yield_progress():
                    return json.dumps({"type": "progress", "message": json.dumps({"agentic_steps": steps})}) + "\n"

                yield yield_progress()

                # Step 1
                query_gen_system = "You are an expert academic librarian. Break down the user's research topic into 3 to 5 highly specific search queries for retrieving relevant chunks from a vector database of research papers."
                sub_queries = await self._call_llm_json(
                    system_prompt=query_gen_system,
                    user_prompt=f"Topic: {query}",
                    temperature=0.2,
                )
                if not isinstance(sub_queries, list):
                    sub_queries = [query]
                
                steps[0]["status"] = "done"
                steps[0]["detail"] = f"Generated {len(sub_queries)} queries"
                steps[1]["status"] = "active"
                steps[1]["detail"] = "Querying vector store..."
                yield yield_progress()

                # Step 2: Vector search + group papers
                all_chunks = []
                seen_chunk_ids = set()
                papers = []
                if group_id:
                    papers = await self._get_group_papers(group_id)
                    settings = get_settings()
                    if vector_store.is_connected:
                        for sq in sub_queries:
                            results = await vector_store.search_group_vectors(group_id=group_id, query=str(sq), limit=settings.rag_chunks_per_query)
                            for res in results:
                                if res["id"] not in seen_chunk_ids:
                                    # Skip chunks with very low vector similarity
                                    similarity = res.get("similarity", 0)
                                    if similarity < settings.rag_similarity_threshold:
                                        continue
                                    seen_chunk_ids.add(res["id"])
                                    all_chunks.append(res)
                
                steps[1]["status"] = "done"
                steps[1]["detail"] = f"Found {len(papers)} papers, {len(all_chunks)} chunks"
                steps[2]["status"] = "active"
                steps[2]["detail"] = "Checking if external papers are needed..."
                yield yield_progress()

                # Step 3
                if len(papers) < 3:
                    steps[2]["detail"] = "Fetching external papers from Arxiv..."
                    yield yield_progress()
                    await self._tool_retrieve_papers(query, RunnableConfig(configurable={"group_id": group_id}))
                    if group_id:
                        papers = await self._get_group_papers(group_id)
                    steps[2]["detail"] = f"Retrieved combined {len(papers)} papers."
                else:
                    steps[2]["detail"] = "Sufficient papers found in DB."
                
                steps[2]["status"] = "done"
                steps[3]["status"] = "active"
                steps[3]["detail"] = "Filtering relevant excerpts..."
                yield yield_progress()

                # Step 4: LLM-based relevance filtering
                if all_chunks:
                    all_chunks = await self._filter_relevant_items(
                        query=query, items=all_chunks,
                        title_key="paper_id", content_key="content",
                    )

                if all_chunks:
                    context_lines = []
                    for i, chunk in enumerate(all_chunks[:settings.rag_max_context_chunks]):
                        context_lines.append(f"--- Excerpt {i+1} ---")
                        context_lines.append(f"Content: {chunk.get('content', '')}")
                    context_text = "\n".join(context_lines)
                else:
                    # Fallback: filter group papers by LLM relevance
                    paper_items = [
                        {
                            "title": p.get("title", "Untitled"),
                            "content": f"{p.get('title', '')} {p.get('abstract', '')}",
                        }
                        for p in papers
                    ]
                    paper_items = await self._filter_relevant_items(
                        query=query, items=paper_items,
                        title_key="title", content_key="content",
                    )

                    if paper_items:
                        context_text = "\n".join(
                            f"- {p['title']}: {p['content'][:400]}" for p in paper_items
                        )
                    else:
                        context_text = (
                            "No papers in the current group are relevant to this topic. "
                            "The review should state that no relevant papers were found "
                            "and suggest the user add papers on this topic to the group."
                        )

                steps[3]["status"] = "done"
                steps[3]["detail"] = f"Filtered to {len(all_chunks)} relevant excerpts" if all_chunks else "Using filtered papers"
                steps[4]["status"] = "active"
                steps[4]["detail"] = "Running LLM to write review..."
                yield yield_progress()

                # Step 5
                system_prompt = (
                    "You are an expert Academic Reviewer. Synthesize the provided paper excerpts into a comprehensive, deeply detailed structured literature review. "
                    "You MUST include a Markdown table comparing the key innovations, methods, or findings of the papers discussed. "
                    "Structure the review with clear thematic sections and a conclusion."
                )

                user_prompt = (
                    f"User topic: {query}\n\n"
                    f"Retrieved Research Excerpts:\n{context_text}\n\n"
                    "Please write the detailed literature review now, ensuring to include the comparative Markdown table."
                )

                final_response = await self._call_llm(system_prompt, user_prompt, temperature=0.3)
                
                steps[4]["status"] = "done"
                steps[4]["detail"] = "Review completed."
                yield yield_progress()

            else:
                # -------------------------------------------------------
                # Generic 5-phase streaming pipeline for all other agents
                # -------------------------------------------------------
                group_id = request.get("group_id")
                query = raw_prompt

                # Define per-task step labels
                TASK_STEPS = {
                    "gap_analysis": [
                        {"icon": "search", "label": "Analyzing research topic", "status": "active", "detail": "Generating sub-queries..."},
                        {"icon": "database", "label": "Searching paper database", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Searching the web", "status": "pending", "detail": ""},
                        {"icon": "layers", "label": "Assembling context", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Identifying research gaps", "status": "pending", "detail": ""},
                    ],
                    "fact_check": [
                        {"icon": "search", "label": "Parsing claims", "status": "active", "detail": "Generating verification queries..."},
                        {"icon": "database", "label": "Searching evidence in DB", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Searching web for evidence", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Searching academic papers", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Synthesizing verdict", "status": "pending", "detail": ""},
                    ],
                    "novelty_assessment": [
                        {"icon": "search", "label": "Analyzing idea", "status": "active", "detail": "Generating prior art queries..."},
                        {"icon": "database", "label": "Searching prior art in DB", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Searching web for similar work", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Searching arXiv papers", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Scoring novelty", "status": "pending", "detail": ""},
                    ],
                    "research_mentor": [
                        {"icon": "search", "label": "Understanding query", "status": "active", "detail": "Generating resource queries..."},
                        {"icon": "database", "label": "Searching group knowledge", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Finding web resources", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Finding academic resources", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Generating mentoring advice", "status": "pending", "detail": ""},
                    ],
                    "paper_writing": [
                        {"icon": "search", "label": "Analyzing paper topic", "status": "active", "detail": "Generating reference queries..."},
                        {"icon": "database", "label": "Gathering references from DB", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Searching web references", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Searching arXiv references", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Drafting paper", "status": "pending", "detail": ""},
                    ],
                    "research_planning": [
                        {"icon": "search", "label": "Analyzing research goals", "status": "active", "detail": "Generating methodology queries..."},
                        {"icon": "database", "label": "Searching group methodologies", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Finding best practices", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Searching academic frameworks", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Building research plan", "status": "pending", "detail": ""},
                    ],
                    "deep_research": [
                        {"icon": "search", "label": "Planning research queries", "status": "active", "detail": "Generating sub-queries..."},
                        {"icon": "database", "label": "Searching vector store", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Searching the web", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Searching arXiv", "status": "pending", "detail": ""},
                        {"icon": "layers", "label": "Summarizing sources", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Writing research report", "status": "pending", "detail": ""},
                    ],
                }

                # Use default steps if task not in map
                default_steps = [
                    {"icon": "search", "label": "Processing query", "status": "active", "detail": "Generating sub-queries..."},
                    {"icon": "database", "label": "Searching knowledge base", "status": "pending", "detail": ""},
                    {"icon": "globe", "label": "Searching the web", "status": "pending", "detail": ""},
                    {"icon": "file-search", "label": "Searching academic papers", "status": "pending", "detail": ""},
                    {"icon": "brain", "label": "Generating response", "status": "pending", "detail": ""},
                ]

                steps = copy.deepcopy(TASK_STEPS.get(effective_task, default_steps))

                def yield_progress():
                    return json.dumps({"type": "progress", "message": json.dumps({"agentic_steps": steps})}) + "\n"

                yield yield_progress()

                # Phase 1: Generate sub-queries
                sub_queries = await self._call_llm_json(
                    system_prompt="You are a research strategist. Generate 3-5 focused search queries relevant to the user's request. Return a JSON array of strings.",
                    user_prompt=f"User request: {query}",
                    temperature=0.2,
                )
                if not isinstance(sub_queries, list):
                    sub_queries = [query]

                steps[0]["status"] = "done"
                steps[0]["detail"] = f"Generated {len(sub_queries)} queries"
                steps[1]["status"] = "active"
                steps[1]["detail"] = "Querying vector store..."
                yield yield_progress()

                # Phase 2-4: Gather context (vector store + web + arXiv)
                context_text, sources = await self._gather_context(
                    query=query,
                    sub_queries=sub_queries,
                    group_id=group_id,
                )

                # Update steps 1-3 as done based on source counts
                vs_count = sum(1 for s in sources if s["type"] == "vector_store")
                web_count = sum(1 for s in sources if s["type"] == "web")
                arxiv_count = sum(1 for s in sources if s["type"] == "arxiv")

                steps[1]["status"] = "done"
                steps[1]["detail"] = f"Found {vs_count} DB results"
                steps[2]["status"] = "done"
                steps[2]["detail"] = f"Found {web_count} web results"
                if len(steps) > 4:
                    steps[3]["status"] = "done"
                    steps[3]["detail"] = f"Found {arxiv_count} arXiv results"
                    synth_idx = len(steps) - 1
                else:
                    synth_idx = 3

                steps[synth_idx]["status"] = "active"
                steps[synth_idx]["detail"] = "Running LLM synthesis..."
                yield yield_progress()

                # Phase 5: Call the actual agent tool
                tool_config = {"configurable": {"group_id": group_id, "user_id": request.get("user_id")}}

                tool_map = {
                    "gap_analysis": lambda: self._tool_analyze_gaps(query, tool_config),
                    "fact_check": lambda: self._tool_fact_check(query, tool_config),
                    "novelty_assessment": lambda: self._tool_assess_novelty(query, tool_config),
                    "research_mentor": lambda: self._tool_provide_mentoring(query, tool_config),
                    "paper_writing": lambda: self._tool_write_paper_draft(query, tool_config),
                    "research_planning": lambda: self._tool_plan_research(query, tool_config),
                    "deep_research": lambda: self._tool_deep_research(query, tool_config),
                }

                tool_fn = tool_map.get(effective_task)
                if tool_fn:
                    final_response = await tool_fn()
                else:
                    # Fallback to generic astream_events
                    async for event in agent.astream_events(
                        initial_input,
                        config={
                            "configurable": {
                                "group_id": request.get("group_id"),
                                "user_id": request.get("user_id")
                            }
                        },
                        version="v2"
                    ):
                        kind = event["event"]
                        name = event["name"]
                        if kind == "on_chat_model_end":
                            msg = event.get("data", {}).get("output", {})
                            if hasattr(msg, "content") and msg.content:
                                final_response = self._extract_text_from_possible_json(msg.content)
                            elif isinstance(msg, dict) and "content" in msg and msg["content"]:
                                final_response = self._extract_text_from_possible_json(msg["content"])

                steps[synth_idx]["status"] = "done"
                steps[synth_idx]["detail"] = "Completed."
                # Mark any remaining intermediate steps as done
                for s in steps:
                    if s["status"] in ("active", "pending"):
                        s["status"] = "done"
                yield yield_progress()

        except Exception as exc:
            logger.error("DeepAgent stream execution failed: %s", exc, exc_info=True)
            yield json.dumps({"type": "error", "error": str(exc)}) + "\n"
            return

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("[trace=%s] Completed stream in %dms", trace_id, latency_ms)

        key_map = {
            "deep_research": "deep_research",
            "literature_survey": "literature_review",
            "gap_analysis": "research_gaps",
            "fact_check": "fact_check",
            "novelty_assessment": "novelty",
            "research_mentor": "mentor_advice",
            "paper_writing": "paper_draft",
            "research_planning": "research_plan",
        }
        result_key = key_map.get(str(effective_task), "result")

        yield json.dumps({
            "type": "complete",
            "task_type": effective_task,
            "trace_id": trace_id,
            "result": {result_key: final_response},
            "artifacts": [],
            "errors": errors,
            "metadata": request.get("options") or {},
            "latency_ms": latency_ms,
        }) + "\n"


agentic_service = AgenticService()
