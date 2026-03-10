"""Workflow state definitions for multi-agent research orchestration."""

from __future__ import annotations

from typing import Any, Optional, TypedDict, Annotated
from dataclasses import dataclass, field


# ============ Step & Plan Definitions ============

@dataclass
class StepDefinition:
    """Defines a single step in a workflow plan."""
    step_index: int
    agent_type: str  # maps to AgenticTaskType or special types
    name: str
    description: str = ""
    is_checkpoint: bool = False
    # Which keys from intermediate_results this step reads
    input_keys: list[str] = field(default_factory=list)
    # The key this step writes its output to in intermediate_results
    output_key: str = ""
    # Additional config passed to the agent
    agent_config: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "step_index": self.step_index,
            "agent_type": self.agent_type,
            "name": self.name,
            "description": self.description,
            "is_checkpoint": self.is_checkpoint,
            "input_keys": self.input_keys,
            "output_key": self.output_key,
            "agent_config": self.agent_config,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "StepDefinition":
        return cls(
            step_index=data["step_index"],
            agent_type=data["agent_type"],
            name=data["name"],
            description=data.get("description", ""),
            is_checkpoint=data.get("is_checkpoint", False),
            input_keys=data.get("input_keys", []),
            output_key=data.get("output_key", ""),
            agent_config=data.get("agent_config", {}),
        )


@dataclass
class WorkflowPlan:
    """Full workflow plan — a serializable DAG of steps."""
    template_id: Optional[str]
    title: str
    description: str
    steps: list[StepDefinition]
    estimated_minutes: int = 10
    research_type: str = "general"  # summarization, gap_analysis, literature_review, custom

    def to_dict(self) -> dict:
        return {
            "template_id": self.template_id,
            "title": self.title,
            "description": self.description,
            "steps": [s.to_dict() for s in self.steps],
            "estimated_minutes": self.estimated_minutes,
            "research_type": self.research_type,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "WorkflowPlan":
        return cls(
            template_id=data.get("template_id"),
            title=data["title"],
            description=data.get("description", ""),
            steps=[StepDefinition.from_dict(s) for s in data.get("steps", [])],
            estimated_minutes=data.get("estimated_minutes", 10),
            research_type=data.get("research_type", "general"),
        )


# ============ Workflow Execution State ============

class WorkflowState(TypedDict, total=False):
    """Runtime state that flows through the workflow graph.

    Extends the concept of AgentState but is designed for multi-step
    orchestration rather than single-agent execution.
    """
    # Workflow identity
    workflow_id: str
    workflow_status: str  # planning | running | paused | completed | failed | cancelled
    current_step_index: int
    plan: dict  # serialized WorkflowPlan

    # Context from the request
    goal: str
    group_id: str
    user_id: str
    session_id: str

    # Accumulated results from each step, keyed by step output_key
    intermediate_results: dict[str, Any]

    # Human feedback collected at checkpoints, keyed by step output_key
    human_feedback: dict[str, str]

    # Papers discovered / used across steps
    papers: list[dict]
    paper_ids: list[str]

    # Final assembled output
    final_output: dict[str, Any]

    # Error tracking
    errors: list[str]

    # Trace
    trace_id: str
