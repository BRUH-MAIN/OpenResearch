"""Agentic orchestration service using LangGraph, LangChain-Groq, and Mem0."""

from __future__ import annotations

import time
from typing import Any, Optional, TypedDict

from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

from .config import get_settings
from .database import database
from .vector_store import vector_store
from .memory import mem0_adapter
from .mcp_client import mcp_client


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
    research_plan: dict
    deep_research: str
    memory_context: list[dict]
    result: dict
    artifacts: list[str]
    metadata: dict
    errors: list[str]


class AgenticService:
    """Orchestrates agentic workflows using LangGraph."""

    def __init__(self) -> None:
        self._llm: Optional[ChatGroq] = None
        self._graph = None
        self._initialized = False

    def initialize(self) -> bool:
        settings = get_settings()
        if not settings.groq_api_key:
            print("⚠️  Groq API key not set - agentic features unavailable")
            return False

        self._llm = ChatGroq(
            api_key=settings.groq_api_key,
            model_name=settings.groq_model,
            temperature=0.3,
        )

        mem0_adapter.initialize()
        mcp_client.initialize()
        self._graph = self._build_graph()
        self._initialized = True
        print("✅ Agentic service initialized (LangGraph)")
        return True

    @property
    def is_initialized(self) -> bool:
        return self._initialized and self._graph is not None

    def _build_graph(self):
        graph = StateGraph(AgentState)

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

        for node in [
            "paper_retrieval",
            "literature_survey",
            "gap_analysis",
            "fact_check",
            "novelty_assessment",
            "research_mentor",
            "paper_writing",
            "research_planning",
            "deep_research",
        ]:
            graph.add_edge(node, END)

        return graph.compile()

    def _route_task(self, state: AgentState) -> str:
        task = state.get("task_type", "").strip().lower()
        return task or "literature_survey"

    def _route_node(self, state: AgentState) -> AgentState:
        return state

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        if not self._llm:
            raise RuntimeError("Agentic LLM not initialized")

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        response = await self._llm.ainvoke(messages)
        return response.content if hasattr(response, "content") else str(response)

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

    async def _paper_retrieval_agent(self, state: AgentState) -> AgentState:
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
            except Exception:
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

        return state

    async def _literature_survey_agent(self, state: AgentState) -> AgentState:
        papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))
        memory_context = await self._load_memory(state)
        state["memory_context"] = memory_context

        system_prompt = (
            "You are the Literature Survey Agent. Synthesize papers into a structured "
            "literature review with themes, timeline, and key contributions."
        )

        user_prompt = (
            f"User query: {state.get('prompt', '')}\n\n"
            f"Memory context: {memory_context}\n\n"
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

        return state

    async def _gap_analysis_agent(self, state: AgentState) -> AgentState:
        papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))
        literature_review = state.get("literature_review")
        if not literature_review:
            survey_state = await self._literature_survey_agent(state)
            literature_review = survey_state.get("literature_review", "")

        system_prompt = (
            "You are the Gap Analysis Agent. Identify research gaps, unresolved debates, "
            "and underexplored areas based on the literature review."
        )

        user_prompt = (
            f"Literature review:\n{literature_review}\n\n"
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

        return state

    async def _fact_check_agent(self, state: AgentState) -> AgentState:
        query = state.get("prompt") or ""
        memory_context = await self._load_memory(state)

        system_prompt = (
            "You are the Fact-Checking Agent. Verify claims against available context. "
            "Return supported, contradicted, or unclear with evidence."
        )

        user_prompt = (
            f"Claim to verify: {query}\n\n"
            f"Memory context: {memory_context}\n\n"
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

        return state

    async def _novelty_assessment_agent(self, state: AgentState) -> AgentState:
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

        return state

    async def _research_mentor_agent(self, state: AgentState) -> AgentState:
        query = state.get("prompt") or ""
        memory_context = await self._load_memory(state)

        system_prompt = (
            "You are the Research Mentor Agent. Provide personalized guidance, "
            "methodology advice, and next steps."
        )

        user_prompt = (
            f"User query: {query}\n\n"
            f"User memory: {memory_context}\n\n"
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

        return state

    async def _paper_writing_agent(self, state: AgentState) -> AgentState:
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

        return state

    async def _research_planning_agent(self, state: AgentState) -> AgentState:
        query = state.get("prompt") or ""
        memory_context = await self._load_memory(state)

        system_prompt = (
            "You are the Research Planning Agent. Create a milestone-based plan with "
            "dependencies, timeline estimates, and resources."
        )

        user_prompt = (
            f"Research plan request: {query}\n\n"
            f"Context: {memory_context}\n\n"
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

        return state

    async def _deep_research_agent(self, state: AgentState) -> AgentState:
        query = state.get("prompt") or ""
        papers = state.get("papers") or await self._get_group_papers(state.get("group_id"))

        system_prompt = (
            "You are the Deep Research Agent. Perform multi-hop reasoning across papers, "
            "identify connections, and produce a comprehensive synthesis."
        )

        user_prompt = (
            f"Deep research query: {query}\n\n"
            f"Papers:\n{self._format_papers(papers, max_items=12)}\n\n"
            "Provide a detailed report with themes, citations, and future directions."
        )

        report = await self._call_llm(system_prompt, user_prompt)
        state["deep_research"] = report
        state["result"] = {"deep_research": report}

        artifact_id = await self._store_artifact(
            state,
            artifact_type="deep_research",
            content=report,
        )
        if artifact_id:
            state.setdefault("artifacts", []).append(artifact_id)

        return state

    async def run_task(self, task: str, request: dict) -> dict:
        if not self.is_initialized:
            self.initialize()

        if not self.is_initialized:
            raise RuntimeError("Agentic service not initialized")

        start_time = time.time()
        raw_prompt = request.get("prompt", "")
        cleaned_query = raw_prompt.lower().replace("@ai", "").strip()

        initial_state: AgentState = {
            "task_type": task,
            "prompt": raw_prompt,
            "query": cleaned_query or raw_prompt,
            "group_id": request.get("group_id"),
            "user_id": request.get("user_id"),
            "session_id": request.get("session_id"),
            "paper_ids": request.get("paper_ids") or [],
            "metadata": request.get("options") or {},
        }

        final_state = await self._graph.ainvoke(initial_state)
        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "task_type": task,
            "result": final_state.get("result", {}),
            "artifacts": final_state.get("artifacts", []),
            "metadata": final_state.get("metadata", {}),
            "latency_ms": latency_ms,
        }


agentic_service = AgenticService()
