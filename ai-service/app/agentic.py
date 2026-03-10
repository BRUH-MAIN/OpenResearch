"""Agentic orchestration service using LangGraph — DeepSeek primary, Groq fallback."""

from __future__ import annotations

import asyncio
import copy
import datetime
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
    from langchain_core.messages import SystemMessage, HumanMessage, AnyMessage
    from langgraph.graph.message import add_messages
    _LANGCHAIN_AVAILABLE = True
    _LANGCHAIN_IMPORT_ERROR: Optional[Exception] = None
except Exception as exc:  # pragma: no cover - optional dependency import
    create_react_agent = None  # type: ignore[assignment]
    tool = None  # type: ignore[assignment]
    SystemMessage = None  # type: ignore[assignment]
    HumanMessage = None  # type: ignore[assignment]
    _LANGCHAIN_AVAILABLE = False
    _LANGCHAIN_IMPORT_ERROR = exc

# LLM provider imports (both optional)
try:
    from langchain_openai import ChatOpenAI  # DeepSeek via OpenAI-compat
except Exception:  # pragma: no cover
    ChatOpenAI = None  # type: ignore[assignment]

try:
    from langchain_groq import ChatGroq
except Exception:  # pragma: no cover
    ChatGroq = None  # type: ignore[assignment]

from .config import get_settings
from .database import database
from .vector_store import vector_store
from .reranker import reranker
from .intent_classifier import classify_intent, classify_intent_detailed
from .tools.arxiv import search_arxiv
from .tools.web_search import search_web
from .tools.methodology_extractor import extract_methodology_for_papers
from .tools.gap_finder import find_embedding_space_gaps

# Default timeout for a single LLM call (seconds).
_LLM_CALL_TIMEOUT = 180

# Intents where a single tool suffices — used for ReAct short-circuit.
_SINGLE_TOOL_INTENTS: dict[str, str] = {
    "fact_check": "_tool_fact_check",
    "research_mentor": "_tool_provide_mentoring",
    "methodology_extraction": "_tool_extract_methodology",
}


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
        self._fallback_llm: Any = None
        self._llm_cache: dict[str, Any] = {}
        self._initialized = False
        self._api_key: Optional[str] = None
        self._provider: Optional[str] = None

    def initialize(self) -> bool:
        if not _LANGCHAIN_AVAILABLE:
            logger.warning(
                "Agentic dependencies unavailable - agentic features disabled: %s",
                _LANGCHAIN_IMPORT_ERROR,
            )
            return False
        settings = get_settings()

        # --- Try DeepSeek first (primary) ---
        if ChatOpenAI is not None and settings.deepseek_api_key:
            try:
                self._llm = ChatOpenAI(
                    api_key=settings.deepseek_api_key,
                    model=settings.deepseek_model,
                    base_url=settings.deepseek_base_url,
                    temperature=0.2,
                )
                self._api_key = settings.deepseek_api_key
                self._provider = "deepseek"
                logger.info("Agentic primary LLM: DeepSeek (%s)", settings.deepseek_model)
            except Exception as e:
                logger.warning("DeepSeek init failed for agentic: %s", e)
                self._llm = None

        # --- Groq as fallback (or primary if DeepSeek unavailable) ---
        if ChatGroq is not None and settings.groq_api_key:
            try:
                groq_llm = ChatGroq(
                    temperature=0.2,
                    model_name=settings.groq_model,
                    api_key=settings.groq_api_key,
                )
                if self._llm is None:
                    self._llm = groq_llm
                    self._api_key = settings.groq_api_key
                    self._provider = "groq"
                    logger.info("Agentic primary LLM (fallback): Groq (%s)", settings.groq_model)
                else:
                    self._fallback_llm = groq_llm
                    logger.info("Agentic fallback LLM: Groq (%s)", settings.groq_model)
            except Exception as e:
                logger.warning("Groq init failed for agentic: %s", e)

        if self._llm is None:
            logger.warning("No LLM provider available — agentic features disabled")
            return False

        self._llm_cache = {(self._provider or "default"): self._llm}
        self._initialized = True
        logger.info("Agentic service initialized (provider: %s)", self._provider)
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

        current_date_str = datetime.date.today().isoformat()
        primary_system_prompt = (
            "You are the Primary Orchestrator. You have access to specialized tools for "
            "various research tasks.\n\n"
            "CRITICAL RULES:\n"
            "1. YOU MUST USE YOUR TOOLS TO COMPLETE THE TASK. DO NOT ANSWER DIRECTLY FROM INTERNAL KNOWLEDGE.\n"
            "2. DO NOT CALL MULTIPLE TOOLS AT ONCE. Call ONE tool, wait for the result, then evaluate if you need to call another tool.\n"
            "3. If the user asks to find or retrieve papers, you MUST ALWAYS call `_tool_retrieve_papers` FIRST.\n"
            "4. If the user asks for a literature review, survey, or gap analysis, you MUST first call `_tool_retrieve_papers` to get the papers into the database, wait for the result, and THEN call `_tool_survey_literature`.\n"
            "5. Never hallucinate paper content.\n"
            "6. When presenting retrieved papers, ALWAYS include each paper's title, authors (if available), abstract snippet, and URL directly in your response. "
            "Do NOT merely refer to tool output — reproduce the key details so the user can see them.\n"
            "7. If conversation history is provided, use it to understand the user's ongoing research topic. "
            "Ensure your tool calls and responses stay on that topic."
        )

        task_tool_map = {
            "paper_retrieval": [self._tool_retrieve_papers],
            "literature_survey": [self._tool_retrieve_papers, self._tool_survey_literature],
            "gap_analysis": [self._tool_retrieve_papers, self._tool_survey_literature, self._tool_analyze_gaps],
            "fact_check": [self._tool_fact_check],
            "novelty_assessment": [self._tool_retrieve_papers, self._tool_assess_novelty],
            "research_mentor": [self._tool_provide_mentoring],
            "paper_writing": [self._tool_retrieve_papers, self._tool_write_paper_draft],
            "deep_research": [self._tool_deep_research],
            "methodology_extraction": [self._tool_retrieve_papers, self._tool_extract_methodology],
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
        # Create a new LLM instance using the active provider
        settings = get_settings()
        if self._provider == "deepseek" and ChatOpenAI is not None:
            llm = ChatOpenAI(
                api_key=settings.deepseek_api_key,
                model=model_name,
                base_url=settings.deepseek_base_url,
                temperature=temperature,
            )
        elif ChatGroq is not None:
            llm = ChatGroq(
                api_key=self._api_key,
                model_name=model_name,
                temperature=temperature,
            )
        else:
            return self._llm  # fall back to default
        self._llm_cache[model_name] = llm
        return llm

    async def _call_llm_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        model_name: Optional[str] = None,
        temperature: float = 0.3,
    ):
        """Stream LLM response token-by-token. Yields individual token strings."""
        if not self._llm:
            raise RuntimeError("Agentic LLM not initialized")
        if SystemMessage is None or HumanMessage is None:
            raise RuntimeError("LangChain message classes not available")

        llm = self._get_llm(model_name=model_name, temperature=temperature)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        try:
            async for chunk in llm.astream(messages):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if token:
                    yield token
        except Exception as primary_err:
            # If the primary model fails, try fallback non-streaming
            logger.warning("LLM stream failed: %s — falling back to non-streaming", primary_err)
            response = await llm.ainvoke(messages)
            text = response.content if hasattr(response, "content") else str(response)
            yield text

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(ConnectionError),
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
        try:
            response = await asyncio.wait_for(
                llm.ainvoke(messages),
                timeout=timeout,
            )
        except (asyncio.TimeoutError, TimeoutError) as te:
            raise TimeoutError(
                f"LLM call timed out after {timeout}s. "
                f"Prompt length: system={len(system_prompt)}, user={len(user_prompt)}"
            ) from te
        return response.content if hasattr(response, "content") else str(response)

    async def _call_llm_json(
        self,
        system_prompt: str,
        user_prompt: str,
        model_name: Optional[str] = None,
        temperature: float = 0.2,
        timeout: float = _LLM_CALL_TIMEOUT,
    ) -> Any:
        """Call the LLM expecting a JSON response. Retries on parse failure."""
        for attempt in range(3):
            raw = await self._call_llm(
                system_prompt,
                user_prompt + "\n\nReturn valid JSON only, no other text.",
                model_name=model_name,
                temperature=temperature,
                timeout=timeout,
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

    def _normalize_text_field(self, value: Any) -> str:
        """Normalize heterogeneous metadata fields to a readable string."""
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (list, tuple, set)):
            flattened: list[str] = []
            for item in value:
                normalized = self._normalize_text_field(item)
                if normalized:
                    flattened.append(normalized)
            return ", ".join(flattened)
        return str(value).strip()

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
        seen_titles: set[str] = set()
        sid = 0

        def _add(title: str, url: str, snippet: str, src_type: str, authors: str = "", year: str = "", venue: str = ""):
            nonlocal sid
            if url and url in seen_urls:
                return
            # De-duplicate vector store sources by normalised title
            norm_title = (title or "").strip().lower()
            if norm_title and norm_title in seen_titles:
                return
            if url:
                seen_urls.add(url)
            if norm_title:
                seen_titles.add(norm_title)
            sid += 1
            source_registry.append({
                "id": f"S{sid}",
                "title": self._normalize_text_field(title) or "Untitled",
                "url": self._normalize_text_field(url),
                "type": src_type,
                "snippet": self._normalize_text_field(snippet)[:500],
                "authors": self._normalize_text_field(authors),
                "year": self._normalize_text_field(year),
                "venue": self._normalize_text_field(venue),
            })

        # 1) Vector store search (hybrid: vector + BM25 + RRF)
        # 2) Web search
        # 3) ArXiv search
        # Run all three search types in parallel for speed
        async def _vector_search():
            results_list = []
            if vector_store.is_connected and group_id:
                for sq in sub_queries[:5]:
                    try:
                        results = await vector_store.hybrid_search_group_vectors(
                            group_id=group_id, query=str(sq), limit=5
                        )
                        for res in results:
                            # Title resolution: JOIN title > metadata title > first line of content > paper_id
                            title = res.get("title") or ""
                            if not title:
                                meta = res.get("metadata") or {}
                                title = meta.get("title", "")
                            if not title:
                                content = res.get("content", "")
                                first_line = content.split("\n")[0].strip() if content else ""
                                if first_line and len(first_line) < 200:
                                    title = first_line
                                else:
                                    title = res.get("paper_id", "DB Chunk")
                            url = res.get("url") or ""
                            if not url:
                                meta = res.get("metadata") or {}
                                url = meta.get("url", "")
                            # Construct arXiv URL from paper_id if no URL present
                            if not url:
                                paper_id = res.get("paper_id", "")
                                if paper_id and paper_id not in ("system", "untitled"):
                                    url = f"https://arxiv.org/abs/{paper_id}"
                            # Extract author / year metadata when available
                            meta = res.get("metadata") or {}
                            authors = meta.get("authors", "")
                            year = meta.get("year", "")
                            results_list.append({
                                "title": title,
                                "url": url,
                                "snippet": res.get("content", ""),
                                "src_type": "vector_store",
                                "authors": authors,
                                "year": year,
                            })
                    except Exception as exc:
                        logger.warning("Hybrid search failed for %r: %s", sq, exc)
            return results_list

        async def _web_search():
            results_list = []
            if include_web:
                for sq in sub_queries[:3]:
                    try:
                        web_results = await search_web(query=str(sq), limit=3)
                        for item in web_results.get("results", []):
                            results_list.append({
                                "title": item.get("title", ""),
                                "url": item.get("url", ""),
                                "snippet": item.get("snippet", ""),
                                "src_type": "web",
                            })
                    except Exception as exc:
                        logger.warning("Web search failed for %r: %s", sq, exc)
            return results_list

        async def _arxiv_search():
            results_list = []
            if include_arxiv:
                for sq in sub_queries[:3]:
                    try:
                        ax_resp = await search_arxiv(query=str(sq), limit=3)
                        for item in ax_resp.get("papers", []):
                            results_list.append({
                                "title": item.get("title", ""),
                                "url": item.get("url", item.get("id", "")),
                                "snippet": item.get("abstract", ""),
                                "src_type": "arxiv",
                                "authors": ", ".join(item.get("authors", [])) if isinstance(item.get("authors"), list) else item.get("authors", ""),
                                "year": item.get("published", "")[:4] if item.get("published") else "",
                            })
                    except Exception as exc:
                        logger.warning("ArXiv search failed for %r: %s", sq, exc)
            return results_list

        vec_results, web_results, arxiv_results = await asyncio.gather(
            _vector_search(), _web_search(), _arxiv_search()
        )

        for item in vec_results + web_results + arxiv_results:
            _add(
                title=item["title"],
                url=item["url"],
                snippet=item["snippet"],
                src_type=item["src_type"],
                authors=item.get("authors", ""),
                year=item.get("year", ""),
                venue=item.get("venue", ""),
            )

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
        Replace [S1], [S2] etc. in LLM output with IEEE-style numbered bracket
        citations that link to the paper.

        Numbers are assigned by order of first appearance in the text so that
        the References section at the bottom lists entries as [1], [2], [3]...
        in reading order.

        Example: [S3] appears first → becomes [[1]](url), [S1] next → [[2]](url)
        """
        import re as _re

        # Detect which source IDs are actually cited and in what order
        cited_order: list[str] = []
        seen: set[str] = set()
        for m in _re.finditer(r"\[(S\d+)\]", text):
            sid = m.group(1)
            if sid not in seen:
                seen.add(sid)
                cited_order.append(sid)

        # Build mapping: source id -> appearance-ordered number
        sid_to_num: dict[str, int] = {}
        for num, sid in enumerate(cited_order, 1):
            sid_to_num[sid] = num

        # Also add any uncited sources at the end (preserving original order)
        next_num = len(cited_order) + 1
        for src in sources:
            if src["id"] not in sid_to_num:
                sid_to_num[src["id"]] = next_num
                next_num += 1

        # Replace markers with numbered links
        for src in sources:
            marker = f"[{src['id']}]"
            if marker not in text:
                continue
            num = sid_to_num[src["id"]]
            url = src["url"]
            if url:
                replacement = f"[[{num}]]({url})"
            else:
                replacement = f"[{num}]"
            text = text.replace(marker, replacement)

        # Remove any leftover [SN] markers the LLM hallucinated beyond valid sources
        valid_ids = {src["id"] for src in sources}
        def _strip_invalid(m: _re.Match) -> str:
            return "" if m.group(1) not in valid_ids else m.group(0)
        text = _re.sub(r"\[(S\d+)\]", _strip_invalid, text)

        # Store the resolved ordering so _build_reference_section can use it
        self._last_citation_order = sid_to_num
        return text

    def _build_reference_section(self, sources: list[dict]) -> str:
        """Build a ## References section in IEEE citation format.

        Entries are ordered by first citation appearance in the text (set by
        _resolve_references) so [1] always comes before [2] etc.
        """
        if not sources:
            return ""

        # Use the appearance order from _resolve_references if available
        sid_to_num: dict[str, int] = getattr(self, "_last_citation_order", {})
        if not sid_to_num:
            # Fallback to original order
            sid_to_num = {src["id"]: i for i, src in enumerate(sources, 1)}

        # Sort sources by their assigned reference number
        sorted_sources = sorted(sources, key=lambda s: sid_to_num.get(s["id"], 9999))

        lines = ["\n\n## References\n"]
        for src in sorted_sources:
            title = self._normalize_text_field(src.get("title", ""))
            url = self._normalize_text_field(src.get("url", ""))
            authors = self._normalize_text_field(src.get("authors", ""))
            year = self._normalize_text_field(src.get("year", ""))
            # Skip sources with no meaningful title
            if not title or title.lower() in ("system", "untitled", "db chunk"):
                continue
            num = sid_to_num.get(src["id"], 0)
            # Build IEEE-style entry: [N] Authors, "Title," year. [Online]. Available: url
            parts = []
            if authors:
                parts.append(authors)
            parts.append(f'"{title}"')
            if year:
                parts.append(year)
            entry = ", ".join(parts)
            if url:
                lines.append(f"[{num}] {entry}. [Online]. Available: [{url}]({url})")
            else:
                lines.append(f"[{num}] {entry}.")
        # If all sources were filtered out, return empty
        if len(lines) <= 1:
            return ""
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Agent Tools
    # ------------------------------------------------------------------

    async def _tool_retrieve_papers(
        self, 
        query: str, 
        config: RunnableConfig, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> str:
        """Search for relevant academic papers from arXiv (read-only, no auto-save to group).
        start_date and end_date should be in YYYY-MM-DD format if requested (e.g., "past 2 years").
        """
        group_id = config.get("configurable", {}).get("group_id")
        try:
            papers: list[dict] = []

            # Search arXiv — results are returned as context only, NOT persisted
            try:
                # If the query itself seems to imply a date constraint, sorting by date might help, but 
                # we increase the limit to 40 to ensure broader coverage before formatting top 8.
                mcp_response = await search_arxiv(
                    query=query, limit=40, start_date=start_date, end_date=end_date
                )
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
        try:
            group_id = config.get("configurable", {}).get("group_id")
            if not group_id:
                return "Error: group_id is required."

            # Generate sub-queries for RAG and ArXiv
            current_date_str = datetime.date.today().isoformat()
            query_gen_system = (
                f"You are an expert academic librarian. The current date is {current_date_str}. Extract a clean arXiv search query, 3-5 specific vector "
                "database sub-queries, and any explicit time constraints (e.g. 'past 2 years', 'since 2021') from the user's research topic. \n"
                "If a time constraint is requested, compute the exact 'start_date' and 'end_date' in 'YYYY-MM-DD' format. If not requested, leave them null.\n"
                "Return ONLY a JSON object with this exact structure:\n"
                '{"arxiv_query": "clean keywords only", "vector_queries": ["query1", "query2"], "start_date": "2022-01-01", "end_date": "2024-01-01"}'
            )
            query_data = await self._call_llm_json(
                system_prompt=query_gen_system,
                user_prompt=f"Topic: {query}",
                temperature=0.2,
            )
            
            # Default fallbacks if parsing fails
            arxiv_query = query
            sub_queries = [query]
            start_date = None
            end_date = None
            
            if isinstance(query_data, dict):
                arxiv_query = query_data.get("arxiv_query", query)
                sub_queries = query_data.get("vector_queries", [query])
                start_date = query_data.get("start_date")
                end_date = query_data.get("end_date")

            time_constraint = f"between {start_date} and {end_date}" if start_date or end_date else "None"

            try:
                papers = await self._get_group_papers(group_id)
                arxiv_papers_fetched = []
                # Always search ArXiv to supplement group papers with external results
                try:
                    sort_by = "submittedDate" if start_date or end_date else "relevance"
                    fetch_limit = 40 if start_date or end_date else 20
                    mcp_response = await search_arxiv(
                        query=arxiv_query, limit=fetch_limit, sort_by=sort_by, start_date=start_date, end_date=end_date
                    )
                    arxiv_papers_fetched = mcp_response.get("papers", [])
                    if arxiv_papers_fetched:
                        logger.info("Successfully fetched %d papers from arXiv.", len(arxiv_papers_fetched))
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
                    "published_date": p.get("published"),
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

        except Exception as exc:
            logger.error("_tool_survey_literature failed: %s", exc, exc_info=True)
            return f"Error surveying literature: {exc}"
    async def _tool_analyze_gaps(self, literature_review_context: str, config: RunnableConfig, pre_context: Optional[tuple[str, list[dict]]] = None) -> str:
        """Identify research gaps, unresolved debates, and underexplored areas."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            if pre_context:
                context_text, sources = pre_context
            else:
                # Generate sub-queries for gap analysis — include full context so
                # queries stay on topic when conversation history is present.
                sub_queries = await self._call_llm_json(
                    system_prompt=(
                        "You are a research strategist. Given the research context below "
                        "(which may include conversation history), generate 3-5 focused "
                        "search queries to find potential research gaps, underexplored areas, "
                        "and recent developments related to THE SPECIFIC TOPIC the user is "
                        "researching. Do NOT generate queries about unrelated topics. "
                        "Return a JSON array of strings."
                    ),
                    user_prompt=f"Topic context:\n{literature_review_context[:3000]}",
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
                "1. Cite sources using ONLY the [S1], [S2], etc. markers from the provided sources below.\n"
                "2. Do NOT invent or fabricate any references, author names, journal names, or DOIs. "
                "Only cite [SN] markers that appear in the provided sources.\n"
                "3. Rate each gap: 🔴 High / 🟡 Medium / 🟢 Low significance\n"
                "4. Suggest concrete approaches for each gap with supporting references\n"
                "5. Structure output with clear numbered gaps\n"
                "6. Be thorough and detailed"
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

    async def _tool_fact_check(self, claim: str, config: RunnableConfig, pre_context: Optional[tuple[str, list[dict]]] = None) -> str:
        """Verify claims against available context. Returns supported, contradicted, or unclear with evidence."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            if pre_context:
                context_text, sources = pre_context
            else:
                # Generate search queries to verify the claim — include
                # conversation context so queries remain on the right topic.
                sub_queries = await self._call_llm_json(
                    system_prompt=(
                        "You are a fact-checking strategist. The user's claim may reference "
                        "an ongoing conversation — use the full context to understand what "
                        "specific topic and papers they are referring to. Generate 3-5 "
                        "search queries to find evidence that supports or contradicts the "
                        "given claim. Return a JSON array of strings."
                    ),
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

    async def _tool_assess_novelty(self, idea: str, config: RunnableConfig, pre_context: Optional[tuple[str, list[dict]]] = None) -> str:
        """Compare an idea against existing papers and assess novelty using hybrid rubric + embedding approach."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            if pre_context:
                context_text, sources = pre_context
            else:
                sub_queries = await self._call_llm_json(
                    system_prompt=(
                        "You are a novelty assessment strategist. The user's idea may "
                        "reference an ongoing conversation — use the full context to "
                        "understand their specific research idea. Generate 3-5 search "
                        "queries to find existing work similar to the idea. Aim to find "
                        "overlapping research. Return a JSON array of strings."
                    ),
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

            # ── Phase 1: Embedding-based similarity ──
            # Compute cosine similarity between the idea and each source snippet
            from app.embeddings import embedding_service
            import numpy as np

            embedding_similarities: list[float] = []
            avg_similarity = 0.0
            max_similarity = 0.0
            try:
                idea_emb, _ = await embedding_service.generate_embedding(idea, task_type="RETRIEVAL_QUERY")
                idea_vec = np.array(idea_emb)
                for src in sources[:15]:
                    snippet = src.get("snippet", "")
                    if not snippet:
                        continue
                    src_emb, _ = await embedding_service.generate_embedding(snippet, task_type="RETRIEVAL_DOCUMENT")
                    src_vec = np.array(src_emb)
                    cos_sim = float(np.dot(idea_vec, src_vec) / (np.linalg.norm(idea_vec) * np.linalg.norm(src_vec) + 1e-9))
                    embedding_similarities.append(cos_sim)
                if embedding_similarities:
                    avg_similarity = sum(embedding_similarities) / len(embedding_similarities)
                    max_similarity = max(embedding_similarities)
            except Exception as exc:
                logger.warning("Embedding similarity computation failed: %s", exc)

            # Convert similarity to a novelty signal (higher similarity = lower novelty)
            # Scale: 0.0 sim → 100 novelty, 1.0 sim → 0 novelty (linear)
            embedding_novelty = max(0, min(100, int((1.0 - max_similarity) * 100)))

            # ── Phase 2: LLM rubric-based assessment ──
            system_prompt = (
                "You are the Novelty Assessment Agent. Compare the idea against existing work.\n\n"
                "RULES:\n"
                "1. Cite all related work using ONLY the [S1], [S2], etc. markers from the provided sources.\n"
                "2. Do NOT invent or fabricate any references. Only cite [SN] markers that appear in the sources.\n"
                "3. Score the idea on each of these 4 dimensions (each 1-5 scale):\n"
                "   a) **Originality** — How novel is the core concept? (1=derivative, 5=groundbreaking)\n"
                "   b) **Technical Novelty** — How new are the methods/techniques? (1=standard, 5=first-of-its-kind)\n"
                "   c) **Practical Impact** — How significant is the potential impact? (1=incremental, 5=transformative)\n"
                "   d) **Differentiation** — How distinct from closest existing work? (1=very similar, 5=clearly distinct)\n"
                "4. For each dimension, cite specific evidence from sources.\n"
                "5. End with a section '## Rubric Scores' containing EXACTLY this format:\n"
                "   - Originality: N/5\n"
                "   - Technical Novelty: N/5\n"
                "   - Practical Impact: N/5\n"
                "   - Differentiation: N/5\n"
                "6. List specific overlaps with existing work (cite sources)\n"
                "7. Identify the unique contributions of the idea\n"
                "8. Suggest differentiation strategies with references"
            )
            user_prompt = (
                f"Idea to assess: {idea}\n\n"
                f"Existing work found:\n{context_text}\n\n"
                f"Embedding analysis: avg cosine similarity to prior art = {avg_similarity:.3f}, "
                f"max similarity = {max_similarity:.3f} (higher = more similar to existing work).\n\n"
                "Provide a comprehensive novelty assessment with the rubric scores."
            )

            raw = await self._call_llm(system_prompt, user_prompt)

            # ── Phase 3: Parse rubric scores and compute composite ──
            rubric_scores: dict[str, int] = {}
            for dim in ("Originality", "Technical Novelty", "Practical Impact", "Differentiation"):
                m = re.search(rf"{dim}:\s*(\d)/5", raw)
                if m:
                    rubric_scores[dim] = int(m.group(1))
            
            if rubric_scores:
                rubric_avg = sum(rubric_scores.values()) / len(rubric_scores)
                rubric_novelty = int(rubric_avg * 20)  # Scale 1-5 → 20-100
            else:
                rubric_novelty = 50  # fallback

            # Composite: 40% embedding signal + 60% rubric score
            composite_score = int(0.4 * embedding_novelty + 0.6 * rubric_novelty)
            composite_score = max(0, min(100, composite_score))

            # ── Phase 4: Append composite score summary ──
            score_section = (
                f"\n\n## Composite Novelty Score: {composite_score}/100\n\n"
                f"| Method | Score | Weight |\n"
                f"|--------|-------|--------|\n"
                f"| Embedding Distance | {embedding_novelty}/100 | 40% |\n"
                f"| Rubric Assessment | {rubric_novelty}/100 | 60% |\n"
                f"| **Composite** | **{composite_score}/100** | — |\n\n"
                f"*Embedding analysis based on cosine similarity against {len(embedding_similarities)} sources "
                f"(avg={avg_similarity:.3f}, max={max_similarity:.3f}).*\n"
            )

            result = self._resolve_references(raw, sources)
            result += score_section
            result += self._build_reference_section(sources)
            return result
        except Exception as exc:
            logger.error("_tool_assess_novelty failed: %s", exc, exc_info=True)
            return f"Error assessing novelty: {exc}"

    async def _tool_provide_mentoring(self, query: str, config: RunnableConfig, pre_context: Optional[tuple[str, list[dict]]] = None) -> str:
        """Provide personalized guidance, methodology advice, and next steps."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            if pre_context:
                context_text, sources = pre_context
            else:
                # Generate search queries for resources — include conversation
                # context so queries pertain to the actual research topic.
                sub_queries = await self._call_llm_json(
                    system_prompt=(
                        "You are a research mentor. The student's question may reference "
                        "an ongoing conversation — use the full context to understand their "
                        "specific research topic. Generate 3-5 search queries to find "
                        "helpful resources, methodologies, tutorials, and seminal papers "
                        "DIRECTLY relevant to their topic. Do NOT generate generic or "
                        "unrelated queries. Return a JSON array of strings."
                    ),
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
                "1. Cite resources using ONLY the [S1], [S2], etc. markers from the provided sources.\n"
                "2. Do NOT invent or fabricate any references. Only cite [SN] markers that appear in the sources.\n"
                "3. Recommend seminal papers with proper citations\n"
                "4. Suggest specific methodologies with references\n"
                "5. Provide step-by-step next actions\n"
                "6. Include recommended tools, datasets, or frameworks with links\n"
                "7. Be encouraging but rigorous"
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

    async def _tool_write_paper_draft(self, paper_request: str, config: RunnableConfig, pre_context: Optional[tuple[str, list[dict]]] = None) -> str:
        """Draft a structured paper outline and key sections."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            if pre_context:
                context_text, sources = pre_context
            else:
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
                "2. Use markdown heading syntax exactly: '# <Title>' for the title and '## <Section>' for all main sections.\n"
                "3. Produce: Title, Abstract, Introduction (with background & citations), "
                "Related Work, Proposed Approach/Outline, and Conclusion\n"
                "4. Cite relevant sources throughout the text\n"
                "5. Follow academic writing conventions\n"
                "6. Make the introduction thorough with proper literature context"
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

    async def _tool_deep_research(self, query: str, config: RunnableConfig, pre_context: Optional[tuple[str, list[dict]]] = None) -> str:
        """Conduct deep research by generating sub-queries, gathering sources, and writing a comprehensive report."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            if pre_context:
                context_text, sources = pre_context
            else:
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
                "Keep citations like [S1], [S2] in the text. Do NOT invent new references — "
                "only use [SN] markers from the provided summaries."
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
                "1. Use ONLY the citations [S1], [S2], etc. that appear in the research notes below.\n"
                "2. Do NOT invent or fabricate any references, author names, journal names, or DOIs.\n"
                "3. Include: Executive Summary, Key Findings, Evidence & Analysis, "
                "Open Questions, and Future Directions\n"
                "4. Be thorough, detailed, and evidence-based\n"
                "5. Each claim must be backed by a citation from the notes"
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

    async def _tool_extract_methodology(
        self,
        query: str,
        config: RunnableConfig,
        papers: Optional[list[dict]] = None,
    ) -> str:
        """Build a domain-specific structured comparison matrix from papers."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            working_papers = list(papers or [])

            # Gather papers from group + arxiv only if not already supplied by workflow state.
            if not working_papers:
                working_papers = await self._get_group_papers(group_id) if group_id else []
                try:
                    ax_resp = await search_arxiv(query=query, limit=15)
                    working_papers.extend(ax_resp.get("papers", []))
                except Exception as exc:
                    logger.warning("ArXiv search failed for structured comparison: %s", exc)

            # Fallback: use _gather_context to build paper-like entries from web/vector sources.
            if not working_papers:
                try:
                    sub_queries = await self._call_llm_json(
                        system_prompt=(
                            "Generate 3-5 search queries to find academic papers relevant to a "
                            "structured comparison request on this topic. Return a JSON array of strings."
                        ),
                        user_prompt=f"Topic: {query}",
                        temperature=0.2,
                    )
                    if not isinstance(sub_queries, list):
                        sub_queries = [query]
                    _, sources = await self._gather_context(
                        query=query, sub_queries=sub_queries, group_id=group_id,
                    )
                    # Convert sources into paper-like dicts the extractor can use
                    for src in sources:
                        if src.get("snippet"):
                            working_papers.append({
                                "title": src.get("title", "Untitled"),
                                "abstract": src.get("snippet", ""),
                                "url": src.get("url", ""),
                            })
                except Exception as exc:
                    logger.warning("Fallback context gather for structured comparison failed: %s", exc)

            if not working_papers:
                return "No papers available for structured comparison."

            # Use the dynamic comparison extractor.
            matrix = await extract_methodology_for_papers(self._call_llm, working_papers[:12])
            columns = matrix.get("columns", []) if isinstance(matrix, dict) else []
            rows = matrix.get("rows", []) if isinstance(matrix, dict) else []

            if not columns or not rows:
                return "Could not extract structured comparison details from available papers."

            def _safe_cell(value: Any) -> str:
                normalized = self._normalize_text_field(value)
                if not normalized:
                    normalized = "N/A"
                normalized = normalized.replace("|", "\\|").replace("\n", " ").strip()
                return normalized[:220]

            # Format as markdown table with domain-specific dynamic columns.
            dynamic_headers = [str(c.get("label", c.get("key", "Field"))).strip() for c in columns if isinstance(c, dict)]
            dynamic_keys = [str(c.get("key", "")).strip() for c in columns if isinstance(c, dict)]
            headers = ["Paper", "Year"] + dynamic_headers
            lines = ["## Structured Comparison Matrix\n"]
            lines.append("| " + " | ".join(headers) + " |")
            lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

            for row in rows:
                values = row.get("values", {}) if isinstance(row, dict) else {}
                cells = [
                    _safe_cell(row.get("title", "Untitled")),
                    _safe_cell(row.get("year", "N/A")),
                ]
                for key in dynamic_keys:
                    value = values.get(key) if isinstance(values, dict) else "N/A"
                    cells.append(_safe_cell(value))
                lines.append("| " + " | ".join(cells) + " |")

            result = "\n".join(lines)

            # Store as artifact
            artifact_state: AgentState = {
                "group_id": group_id,
                "prompt": query,
            }  # type: ignore[typeddict-item]
            await self._store_artifact(
                state=artifact_state,
                artifact_type="methodology_matrix",
                content=result,
                metadata={
                    "paper_count": len(rows),
                    "column_count": len(dynamic_headers),
                    "columns": dynamic_headers,
                },
            )

            return result
        except Exception as exc:
            logger.error("_tool_extract_methodology failed: %s", exc, exc_info=True)
            return f"Error extracting structured comparison: {exc}"

    async def _tool_find_embedding_gaps(self, query: str, config: RunnableConfig) -> str:
        """Find understudied areas via embedding-space clustering."""
        group_id = config.get("configurable", {}).get("group_id")
        try:
            from .embeddings import embedding_service

            # Gather papers and their embeddings
            papers = await self._get_group_papers(group_id) if group_id else []
            try:
                ax_resp = await search_arxiv(query=query, limit=20)
                papers.extend(ax_resp.get("papers", []))
            except Exception:
                pass

            if len(papers) < 5:
                return "Not enough papers (need at least 5) for embedding-space gap analysis."

            paper_embeddings = []
            for p in papers:
                text = f"{p.get('title', '')} {p.get('abstract', '')}"
                emb = await embedding_service.generate_embedding(text)
                if emb is not None:
                    paper_embeddings.append({"embedding": emb, "paper": p})

            if len(paper_embeddings) < 5:
                return "Could not generate enough embeddings for gap analysis."

            gaps = await find_embedding_space_gaps(paper_embeddings, query, self._call_llm)

            if not gaps:
                return "No significant embedding-space gaps detected in the current literature."

            lines = ["## Embedding-Space Research Gaps\n"]
            for i, gap in enumerate(gaps, 1):
                severity = gap.get("severity", "medium").upper()
                lines.append(f"### {i}. [{severity}] {gap.get('gap', 'Unknown gap')}")
                lines.append(f"**Papers in cluster:** {gap.get('paper_count', 0)}")
                questions = gap.get("questions", [])
                if questions:
                    lines.append("**Unanswered questions:**")
                    for q in questions:
                        lines.append(f"  - {q}")
                reps = gap.get("representative_papers", [])
                if reps:
                    lines.append("**Representative papers:** " + "; ".join(reps))
                lines.append("")

            return "\n".join(lines)
        except Exception as exc:
            logger.error("_tool_find_embedding_gaps failed: %s", exc, exc_info=True)
            return f"Error in embedding gap analysis: {exc}"

    async def get_relevant_artifacts(
        self, group_id: str, query: str, limit: int = 5,
    ) -> list[dict]:
        """Retrieve and score past artifacts by relevance to the current query.

        Uses vector store similarity search on stored artifacts, then reranks.
        """
        if not vector_store.is_connected or not group_id:
            return []
        try:
            results = await vector_store.search_group_vectors(
                group_id=group_id,
                query=query,
                limit=limit * 2,
                content_types=None,
                paper_id=None,
            )
            # Keep only artifact types
            artifact_types = {
                "literature_survey", "gap_analysis", "fact_check",
                "novelty_assessment", "research_mentor", "paper_writing",
                "deep_research", "methodology_matrix",
            }
            artifacts = [
                r for r in results
                if r.get("content_type") in artifact_types
                   or (r.get("metadata") or {}).get("artifact_type") in artifact_types
            ]
            if len(artifacts) > 1 and reranker.is_available:
                artifacts = await reranker.rerank(
                    query=query, results=artifacts, top_k=limit, content_key="content",
                )
            return artifacts[:limit]
        except Exception as exc:
            logger.warning("get_relevant_artifacts failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Session history helper
    # ------------------------------------------------------------------

    async def _load_session_history(
        self,
        session_id: Optional[str],
        limit: int = 15,
    ) -> str:
        """Load recent session messages and format as a conversation transcript.

        Returns an empty string when no history is available.
        """
        if not session_id or not database.is_connected:
            return ""
        try:
            messages = await database.get_session_messages(session_id, limit=limit)
            if not messages:
                return ""
            lines: list[str] = []
            for msg in messages:
                role = msg.get("type", "unknown")
                name = msg.get("user_name") or role
                # Truncate very long AI responses to keep context window manageable
                content = msg.get("content", "")
                if role == "ai" and len(content) > 2000:
                    content = content[:2000] + "\n... [truncated]"
                lines.append(f"[{name} ({role})]: {content}")
            return "\n\n".join(lines)
        except Exception as exc:
            logger.warning("Failed to load session history: %s", exc)
            return ""

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
            detailed = classify_intent_detailed(raw_prompt)
            intent = detailed.get("intent")
            score = detailed.get("score", 0.0)
            if intent:
                logger.info(
                    "Auto-classified intent: %s (score=%.3f, ambiguous=%s)",
                    intent, score, detailed.get("ambiguous", False),
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

        # --- Load conversation history from session ---
        session_id = request.get("session_id")
        conversation_history = await self._load_session_history(session_id)

        history_block = ""
        if conversation_history:
            history_block = (
                "<conversation_history>\n"
                "Below is the recent conversation in this session. Use it to "
                "understand the user's ongoing research topic and prior results.\n\n"
                f"{conversation_history}\n"
                "</conversation_history>\n\n"
            )

        user_content = (
            f"{history_block}"
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

        # --- ReAct short-circuit: skip full agent loop for single-tool intents ---
        shortcut_method_name = _SINGLE_TOOL_INTENTS.get(effective_task)
        if shortcut_method_name and hasattr(self, shortcut_method_name):
            logger.info(
                "[trace=%s] Short-circuiting ReAct — calling %s directly",
                trace_id, shortcut_method_name,
            )
            tool_fn = getattr(self, shortcut_method_name)
            tool_config: RunnableConfig = {
                "configurable": {
                    "group_id": request.get("group_id"),
                    "user_id": request.get("user_id"),
                }
            }
            try:
                final_response = await tool_fn(raw_prompt, tool_config)
                errors: list[str] = []
            except Exception as exc:
                logger.error(
                    "[trace=%s] Short-circuit tool %s failed: %s",
                    trace_id, shortcut_method_name, exc, exc_info=True,
                )
                final_response = f"Execution failed: {exc}"
                errors = [str(exc)]
        else:
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

                # Validate that the agent actually used tools (not just internal knowledge)
                tool_messages = [m for m in messages if hasattr(m, "type") and m.type == "tool"]
                errors = []
                if not tool_messages:
                    logger.warning(
                        "[trace=%s] Agent returned response without using any tools — "
                        "result may be based on internal knowledge only",
                        trace_id,
                    )
                    errors.append("Agent did not use tools — response may lack grounded sources")

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
            "methodology_extraction": "methodology_matrix",
        }
        result_key = key_map.get(effective_task, "result")

        # Store the result as an artifact for future cross-run retrieval
        artifact_ids = []
        if final_response and not errors and request.get("group_id"):
            try:
                artifact_state: AgentState = {
                    "group_id": request.get("group_id"),
                    "session_id": request.get("session_id"),
                    "user_id": request.get("user_id"),
                    "prompt": raw_prompt,
                    "paper_ids": request.get("paper_ids"),
                }  # type: ignore[typeddict-item]
                aid = await self._store_artifact(
                    state=artifact_state,
                    artifact_type=effective_task,
                    content=final_response[:8000],
                    metadata={"trace_id": trace_id, "task_type": effective_task},
                )
                if aid:
                    artifact_ids.append(aid)
                    logger.info("[trace=%s] Stored artifact %s", trace_id, aid)
            except Exception as exc:
                logger.warning("[trace=%s] Failed to store artifact: %s", trace_id, exc)

        return {
            "task_type": effective_task,
            "trace_id": trace_id,
            "result": {result_key: final_response},
            "artifacts": artifact_ids,
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
            detailed = classify_intent_detailed(raw_prompt)
            intent = detailed.get("intent")
            score = detailed.get("score", 0.0)
            if intent:
                logger.info("Auto-classified intent: %s (score=%.3f, ambiguous=%s)", intent, score, detailed.get("ambiguous", False))
                effective_task = intent
            else:
                effective_task = "literature_survey"

        trace_id = str(uuid.uuid4())
        logger.info("[trace=%s] Starting stream_task_events for %s", trace_id, effective_task)

        # --- Load conversation history from session ---
        session_id = request.get("session_id")
        conversation_history = await self._load_session_history(session_id)

        history_block = ""
        if conversation_history:
            history_block = (
                "<conversation_history>\n"
                "Below is the recent conversation in this session. Use it to "
                "understand the user's ongoing research topic and prior results.\n\n"
                f"{conversation_history}\n"
                "</conversation_history>\n\n"
            )

        user_content = (
            f"{history_block}"
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

                # Step 1: Generate ArXiv query, vector sub-queries, and date constraints
                current_date_str = datetime.date.today().isoformat()
                query_gen_system = (
                    f"You are an expert academic librarian. The current date is {current_date_str}. Extract a clean arXiv search query, 3-5 specific vector "
                    "database sub-queries, and any explicit time constraints (e.g. 'past 2 years', 'since 2021') from the user's research topic. \n"
                    "If a time constraint is requested, compute the exact 'start_date' and 'end_date' in 'YYYY-MM-DD' format. If not requested, leave them null.\n"
                    "Return ONLY a JSON object with this exact structure:\n"
                    '{"arxiv_query": "clean keywords only", "vector_queries": ["query1", "query2"], "start_date": "2022-01-01", "end_date": "2024-01-01"}'
                )
                query_data = await self._call_llm_json(
                    system_prompt=query_gen_system,
                    user_prompt=f"Topic: {query}",
                    temperature=0.2,
                )

                # Default fallbacks if parsing fails
                arxiv_query = query
                sub_queries = [query]
                start_date = None
                end_date = None

                if isinstance(query_data, dict):
                    arxiv_query = query_data.get("arxiv_query", query)
                    sub_queries = query_data.get("vector_queries", [query])
                    start_date = query_data.get("start_date")
                    end_date = query_data.get("end_date")
                elif isinstance(query_data, list):
                    sub_queries = query_data

                time_constraint = f"between {start_date} and {end_date}" if start_date or end_date else "None"
                
                steps[0]["status"] = "done"
                steps[0]["detail"] = f"Generated {len(sub_queries)} queries"
                steps[0]["sub_steps"] = [str(q)[:80] for q in sub_queries[:5]]
                steps[1]["status"] = "active"
                steps[1]["detail"] = "Querying vector store..."
                yield yield_progress()

                # Step 2: Vector search + group papers
                all_chunks = []
                seen_chunk_ids = set()
                papers = []
                settings = get_settings()
                if group_id:
                    papers = await self._get_group_papers(group_id)
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

                # Step 3: Always fetch from ArXiv to supplement context
                arxiv_papers_fetched = []
                steps[2]["detail"] = "Fetching external papers from Arxiv..."
                yield yield_progress()
                try:
                    sort_by = "submittedDate" if start_date or end_date else "relevance"
                    fetch_limit = 40 if start_date or end_date else 20
                    mcp_response = await search_arxiv(
                        query=arxiv_query, limit=fetch_limit, sort_by=sort_by,
                        start_date=start_date, end_date=end_date,
                    )
                    arxiv_papers_fetched = mcp_response.get("papers", [])
                    if arxiv_papers_fetched:
                        papers.extend(arxiv_papers_fetched)
                        # Inject ArXiv papers as high-priority chunks
                        for i, p in enumerate(arxiv_papers_fetched):
                            chunk_id = f"arxiv_stream_{i}"
                            if chunk_id not in seen_chunk_ids:
                                seen_chunk_ids.add(chunk_id)
                                all_chunks.append({
                                    "id": chunk_id,
                                    "paper_id": p.get("title", "ArXiv Paper"),
                                    "content": f"{p.get('title', '')}\n{p.get('abstract', '')}\nPublished: {p.get('published', 'Unknown')}",
                                    "published_date": p.get("published"),
                                    "similarity": 1.0,
                                    "url": p.get("url", ""),
                                })
                        steps[2]["detail"] = f"Fetched {len(arxiv_papers_fetched)} papers from ArXiv."
                    else:
                        steps[2]["detail"] = "No ArXiv results found."
                except Exception as exc:
                    logger.warning("ArXiv search failed in stream: %s", exc)
                    steps[2]["detail"] = "ArXiv search failed, using DB papers."
                
                if not papers:
                    steps[2]["detail"] += " No papers available."

                steps[2]["status"] = "done"
                steps[3]["status"] = "active"
                steps[3]["detail"] = "Filtering relevant excerpts..."
                yield yield_progress()

                # Step 4: LLM-based relevance filtering
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

                try:
                    final_response = ""
                    async for token in self._call_llm_stream(system_prompt, user_prompt, temperature=0.3):
                        final_response += token
                        yield json.dumps({"type": "token", "content": token}) + "\n"
                except (TimeoutError, asyncio.TimeoutError) as te:
                    logger.error("Literature survey LLM synthesis timed out: %s", te)
                    # Provide a partial response instead of crashing
                    final_response = (
                        "## Literature Review (Partial — Synthesis Timed Out)\n\n"
                        "The synthesis step timed out. Below are the relevant excerpts found:\n\n"
                        f"{context_text[:4000]}"
                    )
                
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
                    "deep_research": [
                        {"icon": "search", "label": "Planning research queries", "status": "active", "detail": "Generating sub-queries..."},
                        {"icon": "database", "label": "Searching vector store", "status": "pending", "detail": ""},
                        {"icon": "globe", "label": "Searching the web", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Searching arXiv", "status": "pending", "detail": ""},
                        {"icon": "layers", "label": "Summarizing sources", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Writing research report", "status": "pending", "detail": ""},
                    ],
                    "methodology_extraction": [
                        {"icon": "search", "label": "Analyzing comparison request", "status": "active", "detail": "Identifying the right dimensions..."},
                        {"icon": "database", "label": "Gathering group papers", "status": "pending", "detail": ""},
                        {"icon": "file-search", "label": "Searching arXiv papers", "status": "pending", "detail": ""},
                        {"icon": "layers", "label": "Extracting structured fields", "status": "pending", "detail": ""},
                        {"icon": "brain", "label": "Building comparison matrix", "status": "pending", "detail": ""},
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

                # Phase 1: Generate sub-queries — include conversation context
                # so the generated queries stay relevant to the user's topic.
                sub_query_context = f"User request: {query}"
                if conversation_history:
                    sub_query_context = (
                        f"Conversation context (use to understand the research topic):\n"
                        f"{conversation_history[-1500:]}\n\n"
                        f"Current user request: {query}"
                    )
                sub_queries = await self._call_llm_json(
                    system_prompt=(
                        "You are a research strategist. Generate 3-5 focused search "
                        "queries relevant to the user's request. If conversation context "
                        "is provided, use it to understand the specific topic the user is "
                        "researching and generate on-topic queries ONLY. "
                        "Return a JSON array of strings."
                    ),
                    user_prompt=sub_query_context,
                    temperature=0.2,
                )
                if not isinstance(sub_queries, list):
                    sub_queries = [query]

                steps[0]["status"] = "done"
                steps[0]["detail"] = f"Generated {len(sub_queries)} queries"
                steps[0]["sub_steps"] = [str(q)[:80] for q in sub_queries[:5]]
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

                # Enrich query with conversation history so downstream tools
                # are aware of the ongoing research context (prevents off-topic drift).
                enriched_query = query
                if conversation_history:
                    enriched_query = (
                        f"Conversation context (use this to stay on topic):\n"
                        f"{conversation_history}\n\n"
                        f"Current user request: {query}"
                    )

                # Pass pre-gathered context to tools so they skip their own
                # _gather_context calls (avoids redundant LLM + search work).
                gathered = (context_text, sources)

                tool_map = {
                    "gap_analysis": lambda: self._tool_analyze_gaps(enriched_query, tool_config, pre_context=gathered),
                    "fact_check": lambda: self._tool_fact_check(enriched_query, tool_config, pre_context=gathered),
                    "novelty_assessment": lambda: self._tool_assess_novelty(enriched_query, tool_config, pre_context=gathered),
                    "research_mentor": lambda: self._tool_provide_mentoring(enriched_query, tool_config, pre_context=gathered),
                    "paper_writing": lambda: self._tool_write_paper_draft(enriched_query, tool_config, pre_context=gathered),
                    "deep_research": lambda: self._tool_deep_research(enriched_query, tool_config, pre_context=gathered),
                    "methodology_extraction": lambda: self._tool_extract_methodology(enriched_query, tool_config),
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

                # Stream the completed tool result as chunked tokens for live rendering
                if final_response and final_response != "Task completed, but no response was generated.":
                    CHUNK_SIZE = 80
                    for i in range(0, len(final_response), CHUNK_SIZE):
                        yield json.dumps({"type": "token", "content": final_response[i:i + CHUNK_SIZE]}) + "\n"

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
            "methodology_extraction": "methodology_matrix",
        }
        result_key = key_map.get(str(effective_task), "result")

        # Store the result as an artifact for future cross-run retrieval
        artifact_ids = []
        if final_response and not errors and request.get("group_id"):
            try:
                artifact_state: AgentState = {
                    "group_id": request.get("group_id"),
                    "session_id": request.get("session_id"),
                    "user_id": request.get("user_id"),
                    "prompt": raw_prompt,
                    "paper_ids": request.get("paper_ids"),
                }  # type: ignore[typeddict-item]
                aid = await self._store_artifact(
                    state=artifact_state,
                    artifact_type=effective_task,
                    content=final_response[:8000],
                    metadata={"trace_id": trace_id, "task_type": effective_task},
                )
                if aid:
                    artifact_ids.append(aid)
                    logger.info("[trace=%s] Stored stream artifact %s", trace_id, aid)
            except Exception as exc:
                logger.warning("[trace=%s] Failed to store stream artifact: %s", trace_id, exc)

        yield json.dumps({
            "type": "complete",
            "task_type": effective_task,
            "trace_id": trace_id,
            "result": {result_key: final_response},
            "artifacts": artifact_ids,
            "errors": errors,
            "metadata": request.get("options") or {},
            "latency_ms": latency_ms,
        }) + "\n"


agentic_service = AgenticService()
