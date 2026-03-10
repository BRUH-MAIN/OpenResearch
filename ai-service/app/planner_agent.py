"""Planner agent — decomposes a research goal into a workflow plan.

Given a natural-language research goal it either selects a matching
predefined template (with parameter customization) or composes a custom
step sequence from available agent types.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from .workflow_state import WorkflowPlan, StepDefinition
from .workflow_templates import WORKFLOW_TEMPLATES, get_template, list_templates

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Agent registry — each entry describes what an agent does, what it needs as
# input, what it produces, and what configuration knobs are available.
# ---------------------------------------------------------------------------

AVAILABLE_AGENTS = [
    {
        "type": "paper_retrieval",
        "name": "Paper Retrieval",
        "description": (
            "Search ArXiv and the user's group library for relevant papers. "
            "Always the FIRST step — every workflow must start here."
        ),
        "input_spec": "None (reads the research goal directly).",
        "output_spec": "A formatted list of papers with titles, authors, abstracts, and URLs.",
        "output_key": "retrieved_papers",
        "config_params": {
            "max_papers": "int — max papers to retrieve (default 15)",
            "search_recent_years": "int — how many years back to search (default 3)",
            "start_date": "str YYYY-MM-DD — explicit start date (overrides search_recent_years)",
            "end_date": "str YYYY-MM-DD — explicit end date (default today)",
        },
    },
    {
        "type": "methodology_extraction",
        "name": "Structured Comparison",
        "description": (
            "Extract structured fields from retrieved papers and organize them "
            "into a comparison matrix (methods, datasets, metrics, results)."
        ),
        "input_spec": "retrieved_papers — the papers to compare.",
        "output_spec": "A markdown comparison table with domain-specific columns.",
        "output_key": "methodology_matrix",
        "config_params": {},
    },
    {
        "type": "literature_survey",
        "name": "Literature Survey",
        "description": (
            "Synthesize retrieved papers into a detailed, thematic literature review "
            "with categorised subsections and a comparison table."
        ),
        "input_spec": (
            "retrieved_papers — required. Optionally also methodology_matrix "
            "for richer context."
        ),
        "output_spec": "A comprehensive markdown literature review with themed sections.",
        "output_key": "literature_review",
        "config_params": {},
    },
    {
        "type": "gap_analysis",
        "name": "Gap Analysis",
        "description": (
            "Identify research gaps, unresolved debates, and underexplored areas "
            "based on the literature review and retrieved papers."
        ),
        "input_spec": "literature_review and/or retrieved_papers.",
        "output_spec": "Numbered research gaps with significance ratings and suggested approaches.",
        "output_key": "research_gaps",
        "config_params": {},
    },
    {
        "type": "novelty_assessment",
        "name": "Novelty Assessment",
        "description": (
            "Score a proposed research idea on novelty using embedding similarity "
            "and a multi-dimensional rubric (originality, technical novelty, impact)."
        ),
        "input_spec": "retrieved_papers and a research idea/proposal.",
        "output_spec": "Composite novelty score (N/100) with rubric breakdown.",
        "output_key": "novelty_assessment",
        "config_params": {},
    },
    {
        "type": "fact_check",
        "name": "Fact Check",
        "description": "Verify specific claims against evidence from retrieved papers.",
        "input_spec": "A claim string plus retrieved_papers context.",
        "output_spec": "Verdict per sub-claim with confidence levels and evidence quotes.",
        "output_key": "fact_check",
        "config_params": {},
    },
    {
        "type": "research_mentor",
        "name": "Research Mentor",
        "description": (
            "Provide personalized research guidance, recommend methodologies, "
            "suggest next steps, and point to seminal papers."
        ),
        "input_spec": "Any previous outputs — adapts advice based on available context.",
        "output_spec": "Actionable mentoring advice with paper recommendations.",
        "output_key": "mentor_advice",
        "config_params": {},
    },
    {
        "type": "paper_writing",
        "name": "Paper Writing",
        "description": (
            "Draft a complete structured academic paper in IEEE format using ALL "
            "accumulated research (papers, literature review, gaps, comparisons)."
        ),
        "input_spec": (
            "retrieved_papers — required. Ideally also literature_review and/or "
            "methodology_matrix for a richer paper."
        ),
        "output_spec": (
            "Full IEEE paper draft: Title, Abstract, Introduction, Related Work, "
            "Methodology, Results/Discussion, Conclusion, References."
        ),
        "output_key": "paper_draft",
        "config_params": {
            "paper_type": "str — summarization|survey|gap_analysis|custom (default summarization)",
            "format": "str — ieee|acm|generic (default ieee)",
        },
    },
    {
        "type": "deep_research",
        "name": "Deep Research",
        "description": (
            "Multi-step autonomous research: plans sub-queries, gathers diverse "
            "sources (web + arXiv + DB), synthesizes a comprehensive report."
        ),
        "input_spec": "None (standalone) or retrieved_papers for focused deep-dive.",
        "output_spec": "Deep research report with executive summary, findings, and open questions.",
        "output_key": "deep_research",
        "config_params": {},
    },
    {
        "type": "latex_generator",
        "name": "LaTeX Generator",
        "description": (
            "Convert a paper draft into IEEE-format LaTeX with BibTeX references. "
            "Must ALWAYS be the LAST step if included."
        ),
        "input_spec": "paper_draft — the draft to convert.",
        "output_spec": "LaTeX source code and compiled PDF (if pdflatex available).",
        "output_key": "latex_output",
        "config_params": {},
    },
]

# Set of valid agent type strings for validation
_VALID_AGENT_TYPES = {a["type"] for a in AVAILABLE_AGENTS}
_AGENT_OUTPUT_KEYS = {a["type"]: a["output_key"] for a in AVAILABLE_AGENTS}


# ---------------------------------------------------------------------------
# Parameter extraction — parse temporal, quantity, and format cues from the
# user's goal BEFORE sending to the LLM so we can inject them into the plan.
# ---------------------------------------------------------------------------

def _extract_query_params(goal: str) -> dict[str, Any]:
    """Extract structured parameters from the natural-language goal.

    Returns a dict that can be merged into agent_config for relevant steps.
    Keys: search_recent_years, start_date, end_date, max_papers, paper_type,
          format, topic.
    """
    params: dict[str, Any] = {}
    goal_lower = goal.lower()

    # --- temporal constraints ---
    # "past/last N years"
    m = re.search(r"(?:past|last|recent)\s+(\d{1,2})\s+years?", goal_lower)
    if m:
        params["search_recent_years"] = int(m.group(1))

    # "since YYYY" or "from YYYY"
    if "search_recent_years" not in params:
        m = re.search(r"(?:since|from|after)\s+(20\d{2})", goal_lower)
        if m:
            import datetime
            year = int(m.group(1))
            params["start_date"] = f"{year}-01-01"
            params["end_date"] = datetime.date.today().isoformat()

    # "between YYYY and YYYY"
    if "start_date" not in params and "search_recent_years" not in params:
        m = re.search(r"between\s+(20\d{2})\s+and\s+(20\d{2})", goal_lower)
        if m:
            params["start_date"] = f"{m.group(1)}-01-01"
            params["end_date"] = f"{m.group(2)}-12-31"

    # --- paper count hints ---
    if any(kw in goal_lower for kw in ["comprehensive", "extensive", "thorough", "in-depth"]):
        params["max_papers"] = 20
    elif any(kw in goal_lower for kw in ["brief", "quick", "short", "concise"]):
        params["max_papers"] = 8

    # --- output format ---
    if "ieee" in goal_lower:
        params["format"] = "ieee"
    elif "acm" in goal_lower:
        params["format"] = "acm"

    # --- paper type ---
    if any(kw in goal_lower for kw in ["survey", "literature review", "systematic review"]):
        params["paper_type"] = "survey"
    elif any(kw in goal_lower for kw in ["gap", "future work"]):
        params["paper_type"] = "gap_analysis"
    elif any(kw in goal_lower for kw in ["summariz", "summarise", "summary", "compare", "comparison"]):
        params["paper_type"] = "summarization"

    return params


# ---------------------------------------------------------------------------
# Plan validation — ensure the LLM-generated plan has valid data flow.
# ---------------------------------------------------------------------------

def _validate_plan(steps: list[StepDefinition]) -> list[StepDefinition]:
    """Validate and auto-fix a list of step definitions.

    Fixes:
    - Ensures the first step is paper_retrieval
    - Ensures latex_generator is the last step if present
    - Removes invalid agent_types
    - Fixes input_keys to only reference valid earlier output_keys
    - Re-indexes step_index values
    """
    if not steps:
        return steps

    # Collect valid steps (drop unknown agent types)
    valid_steps: list[StepDefinition] = []
    for s in steps:
        if s.agent_type in _VALID_AGENT_TYPES:
            valid_steps.append(s)
        else:
            logger.warning("Dropping step with unknown agent_type: %s", s.agent_type)

    if not valid_steps:
        return []

    # Ensure paper_retrieval is first
    has_retrieval_first = valid_steps[0].agent_type == "paper_retrieval"
    if not has_retrieval_first:
        # Check if paper_retrieval exists elsewhere and move it
        retrieval_idx = next(
            (i for i, s in enumerate(valid_steps) if s.agent_type == "paper_retrieval"),
            None,
        )
        if retrieval_idx is not None:
            retrieval_step = valid_steps.pop(retrieval_idx)
            valid_steps.insert(0, retrieval_step)
        else:
            # Insert a default paper_retrieval step
            valid_steps.insert(0, StepDefinition(
                step_index=0,
                agent_type="paper_retrieval",
                name="Retrieve Papers",
                description="Search for relevant papers on the topic.",
                is_checkpoint=False,
                input_keys=[],
                output_key="retrieved_papers",
                agent_config={},
            ))

    # Ensure latex_generator is last if present
    latex_indices = [i for i, s in enumerate(valid_steps) if s.agent_type == "latex_generator"]
    if latex_indices and latex_indices[-1] != len(valid_steps) - 1:
        latex_step = valid_steps.pop(latex_indices[-1])
        valid_steps.append(latex_step)

    # Fix input_keys — only reference output_keys from earlier steps
    available_keys: set[str] = set()
    for i, s in enumerate(valid_steps):
        s.step_index = i
        s.input_keys = [k for k in s.input_keys if k in available_keys]
        available_keys.add(s.output_key)

    # Ensure paper_writing has retrieved_papers as input
    for s in valid_steps:
        if s.agent_type == "paper_writing":
            if not s.input_keys:
                s.input_keys = [k for k in ["retrieved_papers", "literature_review", "methodology_matrix"]
                               if k in available_keys]
            elif "retrieved_papers" in available_keys and "retrieved_papers" not in s.input_keys:
                s.input_keys.insert(0, "retrieved_papers")

    return valid_steps


# ---------------------------------------------------------------------------
# Core planning function
# ---------------------------------------------------------------------------

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

    # Extract structured parameters from the goal
    extracted_params = _extract_query_params(goal)
    logger.info("Extracted query params: %s", extracted_params)

    # Use LLM to compose a plan
    system_prompt = _build_planner_system_prompt()
    user_prompt = _build_user_prompt(goal, extracted_params)

    try:
        raw_response = await llm_call_fn(system_prompt, user_prompt, temperature=0.2)

        plan_data = _parse_plan_json(raw_response)

        if plan_data:
            plan = _build_plan_from_llm(plan_data, goal, extracted_params)
            if plan:
                return plan
    except Exception as exc:
        logger.error("LLM planning failed: %s — falling back to dynamic plan", exc)

    # Fallback: build a plan from keywords + extracted params
    return _fallback_plan(goal, extracted_params)


def _build_user_prompt(goal: str, extracted_params: dict[str, Any]) -> str:
    """Build the user prompt with goal and any extracted parameters."""
    parts = [f"Research Goal:\n{goal}"]

    if extracted_params:
        parts.append("\nExtracted parameters from the query:")
        for k, v in extracted_params.items():
            parts.append(f"  - {k}: {v}")
        parts.append(
            "\nIncorporate these parameters into the appropriate step agent_config fields."
        )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# System prompt — agent-first, with worked examples
# ---------------------------------------------------------------------------

def _build_planner_system_prompt() -> str:
    """Construct the system prompt for the planner LLM."""
    agents_info = json.dumps(
        [{k: v for k, v in a.items() if k != "config_params"} for a in AVAILABLE_AGENTS],
        indent=2,
    )
    config_docs = "\n".join(
        f"- **{a['type']}**: {json.dumps(a['config_params'])}"
        for a in AVAILABLE_AGENTS
        if a.get("config_params")
    )

    return f"""You are a Research Workflow Planner. Analyze the user's research goal and
compose an optimal multi-step workflow by selecting and ordering the right agents.

## Available Agents (select and order these)
{agents_info}

## Agent Configuration Parameters
{config_docs}

## Composition Rules
1. Every workflow MUST start with "paper_retrieval".
2. After retrieval, choose the agents that best serve the goal:
   - For a summarization/comparison paper: paper_retrieval → literature_survey → paper_writing
   - For gap analysis: paper_retrieval → literature_survey → gap_analysis → paper_writing
   - For a survey with structured comparison: paper_retrieval → methodology_extraction → literature_survey → paper_writing
   - Add "latex_generator" only if the user wants LaTeX/PDF output; it must be the LAST step.
3. Each step reads outputs from earlier steps via "input_keys" (list of output_key strings from prior steps).
4. "paper_writing" should read from ALL relevant earlier outputs (e.g. retrieved_papers, literature_review, methodology_matrix).
5. Mark "literature_survey" and "paper_writing" steps as checkpoints (is_checkpoint: true) so the user can review.
6. Keep workflows focused — 3-6 steps is typical. Only add agents that serve the goal.
7. Set agent_config on each step to customize behavior (e.g. search_recent_years, max_papers, paper_type).

## Worked Examples

### Example 1
Goal: "Collect research papers from the past 5 years on drone docking with robotic manipulators and write an IEEE research paper that summarises and compares them."
{{
  "use_template": null,
  "title": "Drone Docking Summarization Paper",
  "description": "Retrieve recent drone docking papers, synthesize a literature review, and write a comparative IEEE paper.",
  "research_type": "summarization",
  "estimated_minutes": 15,
  "steps": [
    {{
      "step_index": 0,
      "agent_type": "paper_retrieval",
      "name": "Retrieve Drone Docking Papers",
      "description": "Search for papers on drone docking with robotic manipulators from the past 5 years.",
      "is_checkpoint": false,
      "input_keys": [],
      "output_key": "retrieved_papers",
      "agent_config": {{"max_papers": 15, "search_recent_years": 5}}
    }},
    {{
      "step_index": 1,
      "agent_type": "literature_survey",
      "name": "Literature Review",
      "description": "Synthesize retrieved papers into a thematic literature review with comparison tables.",
      "is_checkpoint": true,
      "input_keys": ["retrieved_papers"],
      "output_key": "literature_review",
      "agent_config": {{}}
    }},
    {{
      "step_index": 2,
      "agent_type": "paper_writing",
      "name": "Write IEEE Paper",
      "description": "Draft a comprehensive IEEE paper summarising and comparing the drone docking research.",
      "is_checkpoint": true,
      "input_keys": ["retrieved_papers", "literature_review"],
      "output_key": "paper_draft",
      "agent_config": {{"paper_type": "summarization", "format": "ieee"}}
    }}
  ]
}}

### Example 2
Goal: "Do a systematic literature review on federated learning for healthcare since 2020 and identify research gaps."
{{
  "use_template": null,
  "title": "Federated Learning in Healthcare — Gap Analysis",
  "description": "Systematic review of FL in healthcare with research gap identification.",
  "research_type": "gap_analysis",
  "estimated_minutes": 18,
  "steps": [
    {{
      "step_index": 0,
      "agent_type": "paper_retrieval",
      "name": "Retrieve FL Healthcare Papers",
      "description": "Search for federated learning papers in healthcare since 2020.",
      "is_checkpoint": false,
      "input_keys": [],
      "output_key": "retrieved_papers",
      "agent_config": {{"max_papers": 20, "start_date": "2020-01-01"}}
    }},
    {{
      "step_index": 1,
      "agent_type": "methodology_extraction",
      "name": "Extract Methods & Metrics",
      "description": "Build a structured comparison matrix of FL approaches, datasets, and results.",
      "is_checkpoint": false,
      "input_keys": ["retrieved_papers"],
      "output_key": "methodology_matrix",
      "agent_config": {{}}
    }},
    {{
      "step_index": 2,
      "agent_type": "literature_survey",
      "name": "Systematic Literature Review",
      "description": "Synthesize papers into a themed literature review.",
      "is_checkpoint": true,
      "input_keys": ["retrieved_papers", "methodology_matrix"],
      "output_key": "literature_review",
      "agent_config": {{}}
    }},
    {{
      "step_index": 3,
      "agent_type": "gap_analysis",
      "name": "Research Gap Analysis",
      "description": "Identify research gaps, underexplored areas, and future directions.",
      "is_checkpoint": true,
      "input_keys": ["retrieved_papers", "literature_review"],
      "output_key": "research_gaps",
      "agent_config": {{}}
    }},
    {{
      "step_index": 4,
      "agent_type": "paper_writing",
      "name": "Write Survey Paper",
      "description": "Draft an IEEE paper covering the systematic review and identified gaps.",
      "is_checkpoint": true,
      "input_keys": ["retrieved_papers", "methodology_matrix", "literature_review", "research_gaps"],
      "output_key": "paper_draft",
      "agent_config": {{"paper_type": "gap_analysis", "format": "ieee"}}
    }}
  ]
}}

## Response Format
Return ONLY a JSON object:
{{
  "use_template": null,
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

IMPORTANT: Always compose a custom step sequence tailored to the goal.
Do NOT set use_template. Analyze the goal and pick the exact agents needed."""


# ---------------------------------------------------------------------------
# JSON parsing (unchanged logic, cleaner structure)
# ---------------------------------------------------------------------------

def _parse_plan_json(raw: str) -> Optional[dict]:
    """Extract JSON from an LLM response that may contain markdown fences."""
    # Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try extracting from ```json ... ``` fences
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


# ---------------------------------------------------------------------------
# Build plan from LLM output
# ---------------------------------------------------------------------------

def _build_plan_from_llm(
    plan_data: dict, goal: str, extracted_params: dict[str, Any]
) -> Optional[WorkflowPlan]:
    """Convert LLM JSON output into a validated WorkflowPlan."""
    # If the LLM chose a template, use it but apply extracted params
    template_id = plan_data.get("use_template")
    if template_id:
        tmpl = get_template(template_id)
        if tmpl:
            return _apply_params_to_plan(tmpl, extracted_params)

    # Build custom plan from steps
    steps_data = plan_data.get("steps", [])
    if not steps_data:
        logger.warning("LLM returned empty steps")
        return None

    steps = []
    for i, s in enumerate(steps_data):
        agent_type = s.get("agent_type", "paper_retrieval")
        output_key = s.get("output_key") or _AGENT_OUTPUT_KEYS.get(agent_type, f"step_{i}_output")
        steps.append(StepDefinition(
            step_index=i,
            agent_type=agent_type,
            name=s.get("name", f"Step {i}"),
            description=s.get("description", ""),
            is_checkpoint=s.get("is_checkpoint", False),
            input_keys=s.get("input_keys", []),
            output_key=output_key,
            agent_config=s.get("agent_config", {}),
        ))

    # Validate and auto-fix
    steps = _validate_plan(steps)
    if not steps:
        logger.warning("Plan validation produced empty steps")
        return None

    plan = WorkflowPlan(
        template_id=None,
        title=plan_data.get("title", "Custom Research Workflow"),
        description=plan_data.get("description", f"AI-planned workflow for: {goal}"),
        steps=steps,
        estimated_minutes=plan_data.get("estimated_minutes", 15),
        research_type=plan_data.get("research_type", "custom"),
    )

    # Merge extracted params into appropriate step configs
    return _apply_params_to_plan(plan, extracted_params)


def _apply_params_to_plan(
    plan: WorkflowPlan, params: dict[str, Any]
) -> WorkflowPlan:
    """Merge extracted query parameters into the appropriate step configs."""
    if not params:
        return plan

    for step in plan.steps:
        if step.agent_type == "paper_retrieval":
            for key in ("search_recent_years", "start_date", "end_date", "max_papers"):
                if key in params and key not in step.agent_config:
                    step.agent_config[key] = params[key]

        if step.agent_type == "paper_writing":
            for key in ("paper_type", "format"):
                if key in params and key not in step.agent_config:
                    step.agent_config[key] = params[key]

    return plan


# ---------------------------------------------------------------------------
# Fallback — keyword-based plan generation when LLM planning fails
# ---------------------------------------------------------------------------

def _fallback_plan(goal: str, extracted_params: dict[str, Any]) -> WorkflowPlan:
    """Build a dynamic workflow from keywords + extracted params.

    Instead of returning a rigid template, composes a tailored step sequence.
    """
    goal_lower = goal.lower()

    # Determine which agents to use based on goal keywords
    steps: list[StepDefinition] = []

    # Always start with paper retrieval
    retrieval_config: dict[str, Any] = {}
    for key in ("search_recent_years", "start_date", "end_date", "max_papers"):
        if key in extracted_params:
            retrieval_config[key] = extracted_params[key]

    steps.append(StepDefinition(
        step_index=0,
        agent_type="paper_retrieval",
        name="Retrieve Papers",
        description="Search for relevant papers on the topic.",
        is_checkpoint=False,
        input_keys=[],
        output_key="retrieved_papers",
        agent_config=retrieval_config,
    ))

    # Decide middle steps based on keywords
    needs_methodology = any(kw in goal_lower for kw in [
        "compar", "structured", "matrix", "method", "benchmark",
    ])
    needs_survey = any(kw in goal_lower for kw in [
        "survey", "literature review", "systematic review", "review",
        "summariz", "summarise", "overview", "state of the art",
    ])
    needs_gaps = any(kw in goal_lower for kw in [
        "gap", "future work", "open problem", "underexplored", "limitation",
    ])
    needs_novelty = any(kw in goal_lower for kw in [
        "novelty", "novel", "new idea", "original",
    ])
    needs_paper = any(kw in goal_lower for kw in [
        "write", "paper", "report", "draft", "ieee", "acm", "publish",
    ])
    needs_latex = any(kw in goal_lower for kw in [
        "latex", "pdf", "tex",
    ])

    # Default: if nothing specific detected, assume survey + paper
    if not any([needs_methodology, needs_survey, needs_gaps, needs_novelty, needs_paper]):
        needs_survey = True
        needs_paper = True

    idx = 1
    available_keys = {"retrieved_papers"}

    if needs_methodology:
        steps.append(StepDefinition(
            step_index=idx,
            agent_type="methodology_extraction",
            name="Extract & Compare Methods",
            description="Build a structured comparison matrix from the papers.",
            is_checkpoint=False,
            input_keys=["retrieved_papers"],
            output_key="methodology_matrix",
            agent_config={},
        ))
        available_keys.add("methodology_matrix")
        idx += 1

    if needs_survey or needs_gaps:
        steps.append(StepDefinition(
            step_index=idx,
            agent_type="literature_survey",
            name="Literature Review",
            description="Synthesize papers into a thematic literature review.",
            is_checkpoint=True,
            input_keys=sorted(available_keys),
            output_key="literature_review",
            agent_config={},
        ))
        available_keys.add("literature_review")
        idx += 1

    if needs_gaps:
        steps.append(StepDefinition(
            step_index=idx,
            agent_type="gap_analysis",
            name="Research Gap Analysis",
            description="Identify research gaps and future directions.",
            is_checkpoint=True,
            input_keys=["retrieved_papers", "literature_review"],
            output_key="research_gaps",
            agent_config={},
        ))
        available_keys.add("research_gaps")
        idx += 1

    if needs_novelty:
        steps.append(StepDefinition(
            step_index=idx,
            agent_type="novelty_assessment",
            name="Novelty Assessment",
            description="Score research ideas on novelty.",
            is_checkpoint=False,
            input_keys=["retrieved_papers"],
            output_key="novelty_assessment",
            agent_config={},
        ))
        available_keys.add("novelty_assessment")
        idx += 1

    if needs_paper:
        writing_config: dict[str, Any] = {}
        for key in ("paper_type", "format"):
            if key in extracted_params:
                writing_config[key] = extracted_params[key]

        steps.append(StepDefinition(
            step_index=idx,
            agent_type="paper_writing",
            name="Write Research Paper",
            description="Draft a comprehensive research paper from all accumulated research.",
            is_checkpoint=True,
            input_keys=sorted(available_keys),
            output_key="paper_draft",
            agent_config=writing_config,
        ))
        available_keys.add("paper_draft")
        idx += 1

    if needs_latex:
        steps.append(StepDefinition(
            step_index=idx,
            agent_type="latex_generator",
            name="Generate LaTeX",
            description="Convert paper draft to IEEE LaTeX with BibTeX references.",
            is_checkpoint=False,
            input_keys=["paper_draft", "retrieved_papers"],
            output_key="latex_output",
            agent_config={},
        ))
        idx += 1

    # Determine research type
    if needs_gaps:
        research_type = "gap_analysis"
    elif needs_survey:
        research_type = "literature_review"
    else:
        research_type = "summarization"

    return WorkflowPlan(
        template_id=None,
        title="Research Workflow",
        description=f"Auto-generated workflow for: {goal[:100]}",
        steps=steps,
        estimated_minutes=max(10, len(steps) * 3),
        research_type=research_type,
    )
