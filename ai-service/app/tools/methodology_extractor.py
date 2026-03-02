"""Methodology extraction tool — structured comparison of study designs across papers."""

from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """
Extract structured methodology information from this academic paper abstract/text.
Return ONLY valid JSON matching this schema exactly. If a field is unknown, use null.

Schema:
{{
  "design": "study design type (RCT/observational/meta-analysis/systematic review/case study/simulation/theoretical/experimental/survey/etc)",
  "sample_size": integer or null,
  "population": "description of study population or null",
  "measures": ["list", "of", "outcome", "measures"],
  "statistical_methods": ["list", "of", "statistical", "methods", "used"],
  "limitations": ["list", "of", "stated", "limitations"],
  "replication_risk": "low|medium|high based on sample size, design, and field"
}}

Paper text:
{text}
"""


async def extract_methodology_for_papers(
    llm_call,
    papers: list[dict],
) -> list[dict]:
    """Extract methodology metadata for a list of papers using an LLM.

    Args:
        llm_call: async callable(system_prompt, user_prompt) -> str
        papers: list of paper dicts with 'id', 'title', 'abstract', optional 'year', 'doi', 'url'

    Returns:
        list of methodology result dicts.
    """
    results: list[dict] = []

    for paper in papers:
        text = f"{paper.get('title', '')}\n\n{paper.get('abstract', '')}"
        try:
            raw = await llm_call(
                "You are a methodology extraction expert. Return ONLY valid JSON.",
                EXTRACTION_PROMPT.format(text=text),
            )
            # Strip markdown fences
            import re
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned)
            metadata = json.loads(cleaned)

            results.append({
                "paper_id": paper.get("id", ""),
                "title": paper.get("title", "Untitled"),
                "year": paper.get("year") or paper.get("published_date") or paper.get("published"),
                "doi": paper.get("doi"),
                "url": paper.get("url", ""),
                "design": metadata.get("design"),
                "sample_size": metadata.get("sample_size"),
                "population": metadata.get("population"),
                "measures": metadata.get("measures", []),
                "statistical_methods": metadata.get("statistical_methods", []),
                "limitations": metadata.get("limitations", []),
                "replication_risk": metadata.get("replication_risk", "medium"),
            })
        except Exception as exc:
            logger.warning("Methodology extraction failed for %r: %s", paper.get("title"), exc)
            continue

    return results
