"""Planner agent — decomposes a research goal into a workflow plan.

Given a natural-language research goal it either selects a matching
predefined template (with parameter customization) or composes a custom
step sequence from available agent types.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from .workflow_state import WorkflowPlan, StepDefinition
from .workflow_templates import WORKFLOW_TEMPLATES, get_template, list_templates

logger = logging.getLogger(__name__)

# Available agent types the planner can compose
AVAILABLE_AGENTS = [
    {
        "type": "paper_retrieval",
        "name": "Paper Retrieval",
        "description": "Search ArXiv and group library for relevant papers on a topic.",
        "output_key": "retrieved_papers",
    },
    {
        "type": "methodology_extraction",
        "name": "Structured Comparison",
        "description": "Extract the most useful structured fields from papers and organize them into a comparison matrix.",
        "output_key": "methodology_matrix",
    },
    {
        "type": "literature_survey",
        "name": "Literature Survey",
        "description": "Synthesize a thematic literature review with comparison tables.",
        "output_key": "literature_review",
    },
    {
        "type": "gap_analysis",
        "name": "Gap Analysis",
        "description": "Identify research gaps, unresolved debates, and underexplored areas.",
        "output_key": "research_gaps",
    },
    {
        "type": "novelty_assessment",
        "name": "Novelty Assessment",
        "description": "Score potential research ideas on novelty using embeddings + rubric.",
        "output_key": "novelty_assessment",
    },
    {
        "type": "fact_check",
        "name": "Fact Check",
        "description": "Verify specific claims against evidence.",
        "output_key": "fact_check",
    },
    {
        "type": "research_mentor",
        "name": "Research Mentor",
        "description": "Provide research guidance, methodology recommendations, and next steps.",
        "output_key": "mentor_advice",
    },
    {
        "type": "paper_writing",
        "name": "Paper Writing",
        "description": "Draft a structured academic paper in IEEE format.",
        "output_key": "paper_draft",
    },
    {
        "type": "deep_research",
        "name": "Deep Research",
        "description": "Multi-step research: plan queries, gather sources, write comprehensive report.",
        "output_key": "deep_research",
    },
    {
        "type": "latex_generator",
        "name": "LaTeX Generator",
        "description": "Convert paper draft to IEEE LaTeX format with BibTeX references.",
        "output_key": "latex_output",
    },
]


async def plan_workflow(
    goal: str,
    llm_call_fn: Any,
    preferred_template: Optional[str] = None,
) -> WorkflowPlan:
    """Create a workflow plan for the given research goal.

    Parameters
    ----------
    goal : str
        Natural-language description of the research objective.
    llm_call_fn : callable
        An async function ``(system_prompt, user_prompt) -> str`` for LLM calls.
        Typically ``agentic_service._call_llm``.
    preferred_template : str, optional
        If provided, use this template directly (skip LLM planning).

    Returns
    -------
    WorkflowPlan
        A fully specified plan ready for execution.
    """

    # Fast path: explicit template selection
    if preferred_template:
        tmpl = get_template(preferred_template)
        if tmpl:
            logger.info("Using preferred template: %s", preferred_template)
            return tmpl
        logger.warning("Template '%s' not found — falling back to AI planning.", preferred_template)

    # Use LLM to decide best approach
    system_prompt = _build_planner_system_prompt()
    user_prompt = f"Research Goal:\n{goal}"

    try:
        raw_response = await llm_call_fn(system_prompt, user_prompt, temperature=0.2)

        # Parse the JSON from the response
        plan_data = _parse_plan_json(raw_response)

        if plan_data:
            return _build_plan_from_llm(plan_data, goal)
    except Exception as exc:
        logger.error("LLM planning failed: %s — falling back to template matching", exc)

    # Fallback: match goal keywords to a template
    return _fallback_template_match(goal)


def _build_planner_system_prompt() -> str:
    """Construct the system prompt for the planner LLM."""
    templates_info = json.dumps(list_templates(), indent=2)
    agents_info = json.dumps(AVAILABLE_AGENTS, indent=2)

    return f"""You are a Research Workflow Planner. Your job is to analyze a research goal
and create an optimal multi-step workflow plan.

## Available Predefined Templates
{templates_info}

## Available Agent Types
{agents_info}

## Your Task
Given the user's research goal, decide:
1. Whether an existing template is a good fit (possibly with minor modifications)
2. Or compose a custom workflow from the available agents

## Rules
- Every workflow MUST start with "paper_retrieval" to gather source papers
- "paper_writing" should use previous steps' outputs as input
- "latex_generator" should always be the LAST step if included
- Mark important decision points as checkpoints (is_checkpoint: true)
  - Literature survey and paper draft steps should usually be checkpoints
- Keep workflows focused — 4-7 steps is typical
- Each step must specify input_keys (which previous output_keys it reads) and output_key

## Response Format
Return ONLY a JSON object with this structure:
{{
  "use_template": "template_id or null",
  "title": "Workflow title",
  "description": "Brief description",
  "research_type": "summarization|literature_review|gap_analysis|custom",
  "estimated_minutes": 15,
  "steps": [
    {{
      "step_index": 0,
      "agent_type": "paper_retrieval",
      "name": "Step Name",
      "description": "What this step does",
      "is_checkpoint": false,
      "input_keys": [],
      "output_key": "retrieved_papers",
      "agent_config": {{}}
    }}
  ]
}}

If use_template is not null, the steps array will be ignored and the template will be used."""


def _parse_plan_json(raw: str) -> Optional[dict]:
    """Extract JSON from an LLM response that may contain markdown fences."""
    # Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try extracting from ```json ... ``` fences
    import re
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try finding the first { ... } block
    brace_start = raw.find("{")
    brace_end = raw.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            return json.loads(raw[brace_start : brace_end + 1])
        except json.JSONDecodeError:
            pass

    return None


def _build_plan_from_llm(plan_data: dict, goal: str) -> WorkflowPlan:
    """Convert LLM JSON output into a WorkflowPlan."""
    # Check if LLM chose a template
    template_id = plan_data.get("use_template")
    if template_id:
        tmpl = get_template(template_id)
        if tmpl:
            return tmpl

    # Build custom plan from steps
    steps_data = plan_data.get("steps", [])
    if not steps_data:
        logger.warning("LLM returned empty steps — falling back to template match")
        return _fallback_template_match(goal)

    steps = []
    for i, s in enumerate(steps_data):
        steps.append(StepDefinition(
            step_index=i,
            agent_type=s.get("agent_type", "paper_retrieval"),
            name=s.get("name", f"Step {i}"),
            description=s.get("description", ""),
            is_checkpoint=s.get("is_checkpoint", False),
            input_keys=s.get("input_keys", []),
            output_key=s.get("output_key", f"step_{i}_output"),
            agent_config=s.get("agent_config", {}),
        ))

    return WorkflowPlan(
        template_id=None,
        title=plan_data.get("title", "Custom Research Workflow"),
        description=plan_data.get("description", f"AI-planned workflow for: {goal}"),
        steps=steps,
        estimated_minutes=plan_data.get("estimated_minutes", 15),
        research_type=plan_data.get("research_type", "custom"),
    )


def _fallback_template_match(goal: str) -> WorkflowPlan:
    """Match goal text to a template using simple keyword heuristics."""
    goal_lower = goal.lower()

    if any(kw in goal_lower for kw in ["summariz", "comparison", "compare", "survey paper", "review paper"]):
        return WORKFLOW_TEMPLATES["summarization_paper"]

    if any(kw in goal_lower for kw in ["gap", "future work", "open problem", "underexplored"]):
        return WORKFLOW_TEMPLATES["research_gap_report"]

    if any(kw in goal_lower for kw in ["literature review", "systematic review", "state of the art", "overview"]):
        return WORKFLOW_TEMPLATES["systematic_literature_review"]

    # Default to summarization paper as it's the most generally useful
    logger.info("No keyword match — defaulting to summarization_paper template")
    return WORKFLOW_TEMPLATES["summarization_paper"]
