"""Predefined workflow templates for common research tasks.

Each template defines a sequence of agent steps that compose into
an end-to-end research workflow.  Templates are JSON-serializable
and can be customized by the planner agent before execution.
"""

from __future__ import annotations

from .workflow_state import StepDefinition, WorkflowPlan


# ──────────────────────────────────────────────────────────────────
# Template: Summarization / Comparison Paper
# ──────────────────────────────────────────────────────────────────
SUMMARIZATION_PAPER = WorkflowPlan(
    template_id="summarization_paper",
    title="Summarization & Comparison Paper",
    description=(
        "Retrieves papers on a research topic, extracts methodologies from each, "
        "produces a structured literature survey with comparison table, and drafts an "
        "IEEE-format research paper."
    ),
    research_type="summarization",
    estimated_minutes=15,
    steps=[
        StepDefinition(
            step_index=0,
            agent_type="paper_retrieval",
            name="Retrieve Papers",
            description="Search ArXiv and the group library for papers on the topic.",
            is_checkpoint=False,
            input_keys=[],
            output_key="retrieved_papers",
            agent_config={"max_papers": 15, "search_recent_years": 3},
        ),
        StepDefinition(
            step_index=1,
            agent_type="methodology_extraction",
            name="Build Structured Comparison",
            description="Extract the most useful structured fields from each paper for comparison.",
            is_checkpoint=False,
            input_keys=["retrieved_papers"],
            output_key="methodology_matrix",
        ),
        StepDefinition(
            step_index=2,
            agent_type="literature_survey",
            name="Conduct Literature Survey",
            description="Synthesize a thematic literature review with comparison tables.",
            is_checkpoint=True,
            input_keys=["retrieved_papers", "methodology_matrix"],
            output_key="literature_review",
        ),
        StepDefinition(
            step_index=3,
            agent_type="paper_writing",
            name="Draft Research Paper",
            description="Write a full IEEE-format summarization/comparison paper.",
            is_checkpoint=True,
            input_keys=["retrieved_papers", "methodology_matrix", "literature_review"],
            output_key="paper_draft",
            agent_config={"format": "ieee", "paper_type": "summarization"},
        ),
        StepDefinition(
            step_index=4,
            agent_type="latex_generator",
            name="Generate IEEE LaTeX",
            description="Convert the paper draft into LaTeX source with IEEEtran format.",
            is_checkpoint=False,
            input_keys=["paper_draft", "retrieved_papers"],
            output_key="latex_output",
        ),
    ],
)


# ──────────────────────────────────────────────────────────────────
# Template: Systematic Literature Review
# ──────────────────────────────────────────────────────────────────
SYSTEMATIC_LITERATURE_REVIEW = WorkflowPlan(
    template_id="systematic_literature_review",
    title="Systematic Literature Review",
    description=(
        "Performs a comprehensive systematic literature review: retrieves papers, "
        "surveys the literature thematically, identifies research gaps, and writes "
        "a structured review paper."
    ),
    research_type="literature_review",
    estimated_minutes=18,
    steps=[
        StepDefinition(
            step_index=0,
            agent_type="paper_retrieval",
            name="Retrieve Papers",
            description="Broadly search for papers covering the research domain.",
            is_checkpoint=False,
            input_keys=[],
            output_key="retrieved_papers",
            agent_config={"max_papers": 20, "search_recent_years": 5},
        ),
        StepDefinition(
            step_index=1,
            agent_type="literature_survey",
            name="Conduct Literature Survey",
            description="Organize papers thematically and synthesize findings.",
            is_checkpoint=True,
            input_keys=["retrieved_papers"],
            output_key="literature_review",
        ),
        StepDefinition(
            step_index=2,
            agent_type="gap_analysis",
            name="Identify Research Gaps",
            description="Analyze the literature to find underexplored areas and open questions.",
            is_checkpoint=True,
            input_keys=["retrieved_papers", "literature_review"],
            output_key="research_gaps",
        ),
        StepDefinition(
            step_index=3,
            agent_type="paper_writing",
            name="Draft Literature Review Paper",
            description="Write a structured review paper combining survey and gap analysis.",
            is_checkpoint=True,
            input_keys=["retrieved_papers", "literature_review", "research_gaps"],
            output_key="paper_draft",
            agent_config={"format": "ieee", "paper_type": "literature_review"},
        ),
        StepDefinition(
            step_index=4,
            agent_type="latex_generator",
            name="Generate IEEE LaTeX",
            description="Convert the paper draft into LaTeX source with IEEEtran format.",
            is_checkpoint=False,
            input_keys=["paper_draft", "retrieved_papers"],
            output_key="latex_output",
        ),
    ],
)


# ──────────────────────────────────────────────────────────────────
# Template: Research Gap Report
# ──────────────────────────────────────────────────────────────────
RESEARCH_GAP_REPORT = WorkflowPlan(
    template_id="research_gap_report",
    title="Research Gap Analysis Report",
    description=(
        "Identifies and maps research gaps in a domain: retrieves papers, surveys "
        "the field, performs gap and novelty analysis, and writes a concise report "
        "with recommendations for future work."
    ),
    research_type="gap_analysis",
    estimated_minutes=12,
    steps=[
        StepDefinition(
            step_index=0,
            agent_type="paper_retrieval",
            name="Retrieve Papers",
            description="Search for papers in the target research area.",
            is_checkpoint=False,
            input_keys=[],
            output_key="retrieved_papers",
            agent_config={"max_papers": 15, "search_recent_years": 3},
        ),
        StepDefinition(
            step_index=1,
            agent_type="literature_survey",
            name="Survey the Field",
            description="Produce a concise thematic overview of the current state of the art.",
            is_checkpoint=False,
            input_keys=["retrieved_papers"],
            output_key="literature_review",
        ),
        StepDefinition(
            step_index=2,
            agent_type="gap_analysis",
            name="Identify Research Gaps",
            description="Find underexplored areas, methodological shortcomings, and open problems.",
            is_checkpoint=True,
            input_keys=["retrieved_papers", "literature_review"],
            output_key="research_gaps",
        ),
        StepDefinition(
            step_index=3,
            agent_type="novelty_assessment",
            name="Assess Novelty Opportunities",
            description="Score potential research directions based on novelty and feasibility.",
            is_checkpoint=False,
            input_keys=["retrieved_papers", "research_gaps"],
            output_key="novelty_assessment",
        ),
        StepDefinition(
            step_index=4,
            agent_type="paper_writing",
            name="Write Gap Analysis Report",
            description="Compose a structured report with gap map and future work recommendations.",
            is_checkpoint=True,
            input_keys=["retrieved_papers", "literature_review", "research_gaps", "novelty_assessment"],
            output_key="paper_draft",
            agent_config={"format": "ieee", "paper_type": "gap_analysis"},
        ),
        StepDefinition(
            step_index=5,
            agent_type="latex_generator",
            name="Generate IEEE LaTeX",
            description="Convert the report into LaTeX source with IEEEtran format.",
            is_checkpoint=False,
            input_keys=["paper_draft", "retrieved_papers"],
            output_key="latex_output",
        ),
    ],
)


# ──────────────────────────────────────────────────────────────────
# Registry
# ──────────────────────────────────────────────────────────────────
WORKFLOW_TEMPLATES: dict[str, WorkflowPlan] = {
    "summarization_paper": SUMMARIZATION_PAPER,
    "systematic_literature_review": SYSTEMATIC_LITERATURE_REVIEW,
    "research_gap_report": RESEARCH_GAP_REPORT,
}


def get_template(template_id: str) -> WorkflowPlan | None:
    """Look up a template by ID.  Returns None if not found."""
    return WORKFLOW_TEMPLATES.get(template_id)


def list_templates() -> list[dict]:
    """Return serialisable summaries of all available templates."""
    return [
        {
            "template_id": t.template_id,
            "title": t.title,
            "description": t.description,
            "research_type": t.research_type,
            "estimated_minutes": t.estimated_minutes,
            "step_count": len(t.steps),
            "steps_preview": [
                {"name": s.name, "agent_type": s.agent_type, "is_checkpoint": s.is_checkpoint}
                for s in t.steps
            ],
        }
        for t in WORKFLOW_TEMPLATES.values()
    ]
