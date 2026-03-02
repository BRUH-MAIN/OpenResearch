"""Reviewer anticipator tool — predict peer-review critiques based on field patterns."""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

REVIEWER_PROMPT = """
You are a rigorous peer reviewer for a top academic journal.

The researcher is studying: {research_question}

Based on the following literature, which highlights common methodological critiques,
limitations, and open questions in this field:

{literature_context}

Generate the 5 most likely reviewer critiques this paper will receive. For each:
1. State the critique clearly
2. Explain why reviewers commonly raise this issue (cite field patterns)
3. Suggest a preemptive response the author could include

Format as JSON array:
[{{"critique": "...", "reasoning": "...", "suggested_response": "...", "severity": "major|minor"}}]
"""


async def anticipate_reviewer_critiques(
    llm_call,
    research_question: str,
    literature_context: str,
) -> dict:
    """Predict peer-reviewer critiques using literature patterns.

    Args:
        llm_call: async callable(system_prompt, user_prompt) -> str
        research_question: the user's research question / topic
        literature_context: gathered context from sources

    Returns:
        {"research_question": str, "critiques": list[dict], "major_count": int}
    """
    raw = await llm_call(
        "You are a rigorous peer reviewer. Return ONLY valid JSON array.",
        REVIEWER_PROMPT.format(
            research_question=research_question,
            literature_context=literature_context[:8000],
        ),
    )

    # Parse JSON
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        critiques = json.loads(cleaned)
        if not isinstance(critiques, list):
            critiques = [critiques]
    except json.JSONDecodeError:
        logger.warning("Failed to parse reviewer critiques JSON, wrapping raw text")
        critiques = [{"critique": cleaned, "reasoning": "", "suggested_response": "", "severity": "major"}]

    major_count = sum(1 for c in critiques if c.get("severity") == "major")

    return {
        "research_question": research_question,
        "critiques": critiques,
        "major_count": major_count,
    }
