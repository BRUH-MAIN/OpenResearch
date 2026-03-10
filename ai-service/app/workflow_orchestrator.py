"""Workflow orchestrator — chains agents into multi-step research pipelines.

Uses data-driven execution (not LangGraph StateGraph) for simplicity and
maximum control over checkpointing, streaming, and persistence.  Each step
invokes the existing AgenticService tool methods directly, passing
accumulated intermediate results between steps.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, AsyncGenerator, Optional

from .workflow_state import WorkflowPlan, WorkflowState, StepDefinition
from .database import database
from .config import get_settings
from .tools.arxiv import search_arxiv

logger = logging.getLogger(__name__)


class WorkflowOrchestrator:
    """Executes a WorkflowPlan step-by-step, yielding NDJSON events."""

    def __init__(self, agentic_service: Any):
        """
        Parameters
        ----------
        agentic_service : AgenticService
            The singleton agentic service instance that owns all agent tools.
        """
        self._agentic = agentic_service

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute_workflow(
        self,
        workflow_id: str,
        plan: WorkflowPlan,
        goal: str,
        group_id: Optional[str] = None,
        user_id: str = "system",
        session_id: Optional[str] = None,
        start_from_step: int = 0,
        existing_results: Optional[dict[str, Any]] = None,
        human_feedback: Optional[dict[str, str]] = None,
    ) -> AsyncGenerator[str, None]:
        """Execute (or resume) a workflow, yielding NDJSON event lines.

        Event types
        -----------
        workflow:planned   – plan is ready (emitted once at start)
        workflow:step:started  – a step began executing
        workflow:step:progress – sub-step progress within a step
        workflow:step:token    – streaming LLM token within a step
        workflow:step:completed – a step finished successfully
        workflow:step:checkpoint – step output awaits user approval
        workflow:completed – entire workflow done
        workflow:failed    – workflow errored
        """
        t0 = time.time()
        state: WorkflowState = {
            "workflow_id": workflow_id,
            "workflow_status": "running",
            "current_step_index": start_from_step,
            "plan": plan.to_dict(),
            "goal": goal,
            "group_id": group_id,
            "user_id": user_id,
            "session_id": session_id or "",
            "intermediate_results": existing_results or {},
            "human_feedback": human_feedback or {},
            "papers": [],
            "paper_ids": [],
            "final_output": {},
            "errors": [],
            "trace_id": str(uuid.uuid4()),
        }

        await database.update_workflow_run_status(workflow_id, "running", current_step_index=start_from_step)

        # Emit plan overview
        yield _event("workflow:planned", {
            "workflow_id": workflow_id,
            "plan": plan.to_dict(),
        })

        steps = plan.steps[start_from_step:]

        for step_def in steps:
            idx = step_def.step_index
            state["current_step_index"] = idx
            await database.update_workflow_run_status(workflow_id, "running", current_step_index=idx)

            # --- emit step:started ---
            yield _event("workflow:step:started", {
                "workflow_id": workflow_id,
                "step_index": idx,
                "name": step_def.name,
                "agent_type": step_def.agent_type,
                "description": step_def.description,
                "is_checkpoint": step_def.is_checkpoint,
                "total_steps": len(plan.steps),
            })

            # Look up the DB step row
            wf_run = await database.get_workflow_run(workflow_id)
            step_rows = wf_run.get("steps", []) if wf_run else []
            step_row = next((s for s in step_rows if s["step_index"] == idx), None)
            step_db_id = step_row["id"] if step_row else None

            if step_db_id:
                await database.update_workflow_step_status(step_db_id, "running")

            # --- execute the step ---
            try:
                result_text, result_data = await self._execute_step(
                    step_def, state, on_progress=lambda msg: None
                )

                # Store result
                if step_def.output_key:
                    state["intermediate_results"][step_def.output_key] = result_text

                # Persist step output
                if step_db_id:
                    await database.update_workflow_step_status(
                        step_db_id, "completed",
                        output={"text": result_text[:50000], **(result_data or {})},
                    )

                # --- emit step:completed ---
                yield _event("workflow:step:completed", {
                    "workflow_id": workflow_id,
                    "step_index": idx,
                    "name": step_def.name,
                    "output_key": step_def.output_key,
                    "output_preview": result_text[:2000] if result_text else "",
                    "total_steps": len(plan.steps),
                })

                # --- checkpoint ---
                if step_def.is_checkpoint:
                    if step_db_id:
                        await database.update_workflow_step_status(step_db_id, "awaiting_approval")
                    await database.update_workflow_run_status(workflow_id, "paused", current_step_index=idx)

                    yield _event("workflow:step:checkpoint", {
                        "workflow_id": workflow_id,
                        "step_index": idx,
                        "name": step_def.name,
                        "output_key": step_def.output_key,
                        "output": result_text,
                        "total_steps": len(plan.steps),
                        "message": f"Step '{step_def.name}' completed. Please review the output and approve or provide feedback.",
                    })
                    # STOP execution — caller must resume after approval
                    return

            except Exception as exc:
                logger.error("Workflow step %d (%s) failed: %s", idx, step_def.name, exc, exc_info=True)
                error_msg = str(exc)
                state["errors"].append(f"Step {idx} ({step_def.name}): {error_msg}")

                if step_db_id:
                    await database.update_workflow_step_status(
                        step_db_id, "failed", error_message=error_msg
                    )
                await database.update_workflow_run_status(workflow_id, "failed")

                yield _event("workflow:failed", {
                    "workflow_id": workflow_id,
                    "step_index": idx,
                    "name": step_def.name,
                    "error": error_msg,
                })
                return

        # --- all steps complete ---
        total_ms = int((time.time() - t0) * 1000)
        final_output = {
            "intermediate_results": state["intermediate_results"],
            "latency_ms": total_ms,
        }
        await database.update_workflow_run_status(
            workflow_id, "completed", final_output=final_output
        )

        yield _event("workflow:completed", {
            "workflow_id": workflow_id,
            "total_steps": len(plan.steps),
            "latency_ms": total_ms,
            "output_keys": list(state["intermediate_results"].keys()),
        })

    # ------------------------------------------------------------------
    # Step execution router
    # ------------------------------------------------------------------

    async def _execute_step(
        self,
        step_def: StepDefinition,
        state: WorkflowState,
        on_progress: Any = None,
    ) -> tuple[str, dict | None]:
        """Execute a single step, returning (result_text, extra_data).

        Routes to the appropriate agent tool method based on
        ``step_def.agent_type``.
        """
        agent_type = step_def.agent_type
        goal = state["goal"]
        group_id = state["group_id"]
        user_id = state["user_id"]
        intermediate = state.get("intermediate_results", {})

        # Build a RunnableConfig compatible dict
        config = {"configurable": {"group_id": group_id, "user_id": user_id}}

        # Collect input context from previous steps
        input_context = self._build_input_context(step_def, intermediate)

        logger.info(
            "Executing workflow step %d (%s) agent=%s",
            step_def.step_index, step_def.name, agent_type,
        )

        if agent_type == "paper_retrieval":
            return await self._run_paper_retrieval(goal, config, step_def, state)

        elif agent_type == "methodology_extraction":
            return await self._run_methodology_extraction(goal, config, input_context, state)

        elif agent_type == "literature_survey":
            return await self._run_literature_survey(goal, config, input_context, state)

        elif agent_type == "gap_analysis":
            return await self._run_gap_analysis(goal, config, input_context, state)

        elif agent_type == "novelty_assessment":
            return await self._run_novelty_assessment(goal, config, input_context, state)

        elif agent_type == "paper_writing":
            return await self._run_paper_writing(goal, config, input_context, step_def, state)

        elif agent_type == "fact_check":
            return await self._run_fact_check(goal, config, input_context, state)

        elif agent_type == "research_mentor":
            return await self._run_research_mentor(goal, config, input_context, state)

        elif agent_type == "deep_research":
            return await self._run_deep_research(goal, config, input_context, state)

        elif agent_type == "latex_generator":
            return await self._run_latex_generator(input_context, state)

        else:
            raise ValueError(f"Unknown agent type: {agent_type}")

    # ------------------------------------------------------------------
    # Individual step runners
    # ------------------------------------------------------------------

    async def _run_paper_retrieval(
        self, goal: str, config: dict, step_def: StepDefinition, state: WorkflowState
    ) -> tuple[str, dict | None]:
        max_papers = step_def.agent_config.get("max_papers", 15)
        years = step_def.agent_config.get("search_recent_years", 3)

        import datetime
        end_date = datetime.date.today().isoformat()
        start_date = (datetime.date.today() - datetime.timedelta(days=365 * years)).isoformat()

        result = await self._agentic._tool_retrieve_papers(
            query=goal, config=config, start_date=start_date, end_date=end_date
        )

        # Persist structured paper objects for downstream steps.
        papers: list[dict] = []
        group_id = config.get("configurable", {}).get("group_id")
        try:
            if group_id:
                papers.extend(await self._agentic._get_group_papers(group_id))
        except Exception as exc:
            logger.warning("Failed to load group papers for workflow state: %s", exc)

        try:
            ax_resp = await search_arxiv(query=goal, limit=max_papers, start_date=start_date, end_date=end_date)
            papers.extend(ax_resp.get("papers", []))
        except Exception as exc:
            logger.warning("Failed to load arXiv papers for workflow state: %s", exc)

        if papers:
            deduped: list[dict] = []
            seen: set[tuple[str, str]] = set()
            for paper in papers:
                title = str(paper.get("title", "")).strip().lower()
                url = str(paper.get("url", "")).strip().lower()
                key = (title, url)
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(paper)
            state["papers"] = deduped[:max_papers]
            state["paper_ids"] = [str(p.get("id", "")) for p in state["papers"] if p.get("id")]

        return result, {"max_papers": max_papers, "paper_count": len(state.get("papers", []))}

    async def _run_methodology_extraction(
        self, goal: str, config: dict, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        query = f"Create a structured comparison from papers about: {goal}"
        if input_context:
            query += f"\n\nContext from previous steps:\n{input_context[:3000]}"
        papers = state.get("papers", [])
        result = await self._agentic._tool_extract_methodology(
            query=query,
            config=config,
            papers=papers if papers else None,
        )
        return result, None

    async def _run_literature_survey(
        self, goal: str, config: dict, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        query = goal
        if input_context:
            query += f"\n\nPrevious analysis:\n{input_context[:4000]}"
        result = await self._agentic._tool_survey_literature(query=query, config=config)
        return result, None

    async def _run_gap_analysis(
        self, goal: str, config: dict, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        lit_review = input_context or goal
        pre_context = None
        if input_context:
            pre_context = (input_context, [])
        result = await self._agentic._tool_analyze_gaps(
            literature_review_context=lit_review, config=config, pre_context=pre_context
        )
        return result, None

    async def _run_novelty_assessment(
        self, goal: str, config: dict, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        idea = f"Research directions in: {goal}"
        if input_context:
            idea += f"\n\nBased on gap analysis:\n{input_context[:3000]}"
        pre_context = (input_context, []) if input_context else None
        result = await self._agentic._tool_assess_novelty(
            idea=idea, config=config, pre_context=pre_context
        )
        return result, None

    async def _run_paper_writing(
        self, goal: str, config: dict, input_context: str, step_def: StepDefinition, state: WorkflowState
    ) -> tuple[str, dict | None]:
        paper_type = step_def.agent_config.get("paper_type", "summarization")
        fmt = step_def.agent_config.get("format", "ieee")

        # Build a rich request that includes all previous step outputs
        paper_request = self._build_paper_writing_prompt(goal, paper_type, state)
        pre_context = (input_context, []) if input_context else None

        result = await self._agentic._tool_write_paper_draft(
            paper_request=paper_request, config=config, pre_context=pre_context
        )
        return result, {"paper_type": paper_type, "format": fmt}

    async def _run_fact_check(
        self, goal: str, config: dict, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        claim = input_context or goal
        pre_context = (input_context, []) if input_context else None
        result = await self._agentic._tool_fact_check(
            claim=claim, config=config, pre_context=pre_context
        )
        return result, None

    async def _run_research_mentor(
        self, goal: str, config: dict, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        query = goal
        if input_context:
            query += f"\n\nResearch context:\n{input_context[:3000]}"
        pre_context = (input_context, []) if input_context else None
        result = await self._agentic._tool_provide_mentoring(
            query=query, config=config, pre_context=pre_context
        )
        return result, None

    async def _run_deep_research(
        self, goal: str, config: dict, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        query = goal
        if input_context:
            query += f"\n\nExisting research:\n{input_context[:3000]}"
        pre_context = (input_context, []) if input_context else None
        result = await self._agentic._tool_deep_research(
            query=query, config=config, pre_context=pre_context
        )
        return result, None

    async def _run_latex_generator(
        self, input_context: str, state: WorkflowState
    ) -> tuple[str, dict | None]:
        """Generate LaTeX from the paper draft using the LaTeX generator."""
        try:
            from .latex_generator import generate_ieee_paper

            paper_draft = state.get("intermediate_results", {}).get("paper_draft", "")
            if not paper_draft and input_context:
                paper_draft = input_context

            if not paper_draft:
                return "Error: No paper draft available for LaTeX generation.", None

            result = await generate_ieee_paper(
                draft_text=paper_draft,
                metadata={"title": state.get("plan", {}).get("title", "Research Paper")},
                compile_pdf=True,
            )

            latex_source = result.get("latex_source", "")
            summary_parts = [f"LaTeX generated ({result.get('sections_count', 0)} sections, {result.get('references_count', 0)} references)."]
            if result.get("pdf_filename"):
                summary_parts.append(f"PDF compiled: {result['pdf_filename']}")
            else:
                summary_parts.append("PDF compilation skipped (pdflatex not available).")

            output_text = "\n".join(summary_parts) + "\n\n" + latex_source
            return output_text, {
                "format": "latex",
                "pdf_path": result.get("pdf_path"),
                "pdf_filename": result.get("pdf_filename"),
            }
        except Exception as exc:
            logger.error("LaTeX generation failed: %s", exc, exc_info=True)
            return f"LaTeX generation error: {exc}", None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_input_context(self, step_def: StepDefinition, intermediate: dict[str, Any]) -> str:
        """Concatenate outputs from input_keys into a single context string."""
        parts = []
        for key in step_def.input_keys:
            value = intermediate.get(key)
            if value:
                text = value if isinstance(value, str) else json.dumps(value, indent=2)
                parts.append(f"=== {key} ===\n{text}")
        return "\n\n".join(parts)

    def _build_paper_writing_prompt(self, goal: str, paper_type: str, state: WorkflowState) -> str:
        """Create a detailed paper writing prompt that includes all accumulated research."""
        intermediate = state.get("intermediate_results", {})
        sections = [f"Research Goal: {goal}", f"Paper Type: {paper_type}"]

        if "retrieved_papers" in intermediate:
            sections.append(f"\n## Retrieved Papers\n{intermediate['retrieved_papers'][:3000]}")
        if "methodology_matrix" in intermediate:
            sections.append(f"\n## Structured Comparison\n{intermediate['methodology_matrix'][:3000]}")
        if "literature_review" in intermediate:
            sections.append(f"\n## Literature Review\n{intermediate['literature_review'][:4000]}")
        if "research_gaps" in intermediate:
            sections.append(f"\n## Research Gaps\n{intermediate['research_gaps'][:2000]}")
        if "novelty_assessment" in intermediate:
            sections.append(f"\n## Novelty Assessment\n{intermediate['novelty_assessment'][:2000]}")

        # Include user feedback if they edited at checkpoints
        feedback = state.get("human_feedback", {})
        if feedback:
            feedback_text = "\n".join(f"- Feedback on {k}: {v}" for k, v in feedback.items())
            sections.append(f"\n## User Feedback / Revisions\n{feedback_text}")

        sections.append(
            "\nWrite a comprehensive IEEE-format research paper. "
            "Include: Title, Abstract, I. Introduction, II. Related Work / Literature Review, "
            "III. Methodology / Approach, IV. Results and Discussion (with comparison tables), "
            "V. Conclusion, References. "
            "Use proper academic tone and cite sources throughout."
        )
        return "\n".join(sections)


# ------------------------------------------------------------------
# Utility
# ------------------------------------------------------------------

def _event(event_type: str, data: dict) -> str:
    """Encode a workflow event as an NDJSON line."""
    return json.dumps({"type": event_type, **data}) + "\n"
