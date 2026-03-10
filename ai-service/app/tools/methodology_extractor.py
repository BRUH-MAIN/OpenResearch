"""Structured comparison extraction tool with dynamic schema discovery.

The extractor uses two LLM passes:
1) Discover domain-appropriate comparison columns from the paper set.
2) Extract row values for each paper using the discovered schema.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_COLUMNS = [
    {
        "key": "approach",
        "label": "Approach",
        "description": "Core method, architecture, framework, or study design.",
    },
    {
        "key": "data_or_benchmark",
        "label": "Data/Benchmark",
        "description": "Primary dataset, corpus, benchmark, or evaluation substrate.",
    },
    {
        "key": "evaluation",
        "label": "Evaluation",
        "description": "Main metrics, protocol, or evaluation setup.",
    },
    {
        "key": "key_findings",
        "label": "Key Findings",
        "description": "Most important claimed findings or comparative outcomes.",
    },
    {
        "key": "limitations",
        "label": "Limitations",
        "description": "Noted weaknesses, assumptions, tradeoffs, or open problems.",
    },
]


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _parse_json_object(text: str) -> dict[str, Any]:
    cleaned = _strip_code_fences(text)
    return json.loads(cleaned)


def _truncate_text(value: Any, limit: int = 1200) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _normalize_columns(raw_columns: Any) -> list[dict[str, str]]:
    if not isinstance(raw_columns, list):
        return DEFAULT_COLUMNS

    columns: list[dict[str, str]] = []
    seen_keys: set[str] = set()
    for idx, col in enumerate(raw_columns):
        if not isinstance(col, dict):
            continue

        raw_key = str(col.get("key", "")).strip().lower()
        if not raw_key:
            raw_key = str(col.get("label", f"col_{idx+1}")).strip().lower()
        key = re.sub(r"[^a-z0-9]+", "_", raw_key).strip("_") or f"col_{idx+1}"
        if key in seen_keys:
            continue
        seen_keys.add(key)

        label = str(col.get("label", key.replace("_", " ").title())).strip() or key
        description = str(col.get("description", "")).strip()
        columns.append({"key": key, "label": label, "description": description})

    return columns[:7] if columns else DEFAULT_COLUMNS


def _normalize_value(value: Any) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, str):
        text = value.strip()
        return text if text else "N/A"
    if isinstance(value, (list, tuple, set)):
        items = [str(v).strip() for v in value if str(v).strip()]
        return ", ".join(items) if items else "N/A"
    return str(value)


async def _discover_schema(llm_call, papers: list[dict]) -> list[dict[str, str]]:
    paper_summaries = []
    for paper in papers:
        paper_summaries.append({
            "title": paper.get("title", "Untitled"),
            "abstract": _truncate_text(paper.get("abstract", ""), 700),
            "year": paper.get("year") or paper.get("published_date") or paper.get("published"),
        })

    system_prompt = (
        "You are a research analysis specialist. Create comparison columns that fit the domain of"
        " the provided papers and the likely comparison intent. Favor practical and discriminative columns over generic ones."
        " Return ONLY valid JSON."
    )
    user_prompt = (
        "Given these papers, propose 5 to 7 comparison columns for a structured comparison matrix.\n"
        "The columns can cover methods, architectures, datasets, benchmarks, evaluation strategy, findings, limitations, or other domain-relevant facets.\n"
        "Avoid forcing medical/clinical fields when not appropriate.\n"
        "Return JSON with this schema exactly:\n"
        "{\n"
        "  \"columns\": [\n"
        "    {\"key\": \"snake_case\", \"label\": \"Display Label\", \"description\": \"what to extract\"}\n"
        "  ]\n"
        "}\n\n"
        f"Papers:\n{json.dumps(paper_summaries, ensure_ascii=True, indent=2)}"
    )

    try:
        raw = await llm_call(system_prompt, user_prompt)
        parsed = _parse_json_object(raw)
        return _normalize_columns(parsed.get("columns"))
    except Exception as exc:
        logger.warning("Schema discovery failed, using defaults: %s", exc)
        return DEFAULT_COLUMNS


async def _extract_rows(llm_call, papers: list[dict], columns: list[dict[str, str]]) -> list[dict[str, Any]]:
    payload = []
    for idx, paper in enumerate(papers, start=1):
        payload.append({
            "paper_index": idx,
            "paper_id": paper.get("id", ""),
            "title": paper.get("title", "Untitled"),
            "year": paper.get("year") or paper.get("published_date") or paper.get("published"),
            "abstract": _truncate_text(paper.get("abstract", ""), 1400),
            "full_text": _truncate_text(paper.get("full_text", ""), 1800),
            "url": paper.get("url", ""),
        })

    schema_hints = [{"key": c["key"], "label": c["label"], "description": c.get("description", "")} for c in columns]
    system_prompt = (
        "You extract structured comparison rows from academic paper metadata."
        " Use only provided paper content and return ONLY valid JSON."
    )
    user_prompt = (
        "Extract one row per paper for the given comparison schema.\n"
        "If a value is unknown, use null. Keep values concise.\n"
        "Return JSON exactly as:\n"
        "{\n"
        "  \"rows\": [\n"
        "    {\n"
        "      \"paper_index\": 1,\n"
        "      \"paper_id\": \"...\",\n"
        "      \"title\": \"...\",\n"
        "      \"year\": \"...\",\n"
        "      \"values\": {\"col_key\": \"value or null\"}\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"Schema:\n{json.dumps(schema_hints, ensure_ascii=True, indent=2)}\n\n"
        f"Papers:\n{json.dumps(payload, ensure_ascii=True, indent=2)}"
    )

    raw = await llm_call(system_prompt, user_prompt)
    parsed = _parse_json_object(raw)
    rows_raw = parsed.get("rows", [])
    if not isinstance(rows_raw, list):
        return []

    rows: list[dict[str, Any]] = []
    col_keys = {c["key"] for c in columns}
    for row in rows_raw:
        if not isinstance(row, dict):
            continue
        values_raw = row.get("values", {})
        values: dict[str, str] = {}
        if isinstance(values_raw, dict):
            for key in col_keys:
                values[key] = _normalize_value(values_raw.get(key))
        else:
            for key in col_keys:
                values[key] = "N/A"

        rows.append({
            "paper_id": row.get("paper_id", ""),
            "title": row.get("title", "Untitled"),
            "year": row.get("year"),
            "values": values,
        })

    return rows


async def extract_methodology_for_papers(
    llm_call,
    papers: list[dict],
) -> dict[str, Any]:
    """Extract a structured comparison matrix for papers with a dynamic schema.

    Args:
        llm_call: async callable(system_prompt, user_prompt) -> str
        papers: list of paper dicts with 'id', 'title', 'abstract', optional 'year', 'doi', 'url'

    Returns:
        dict with keys:
        - columns: list[dict[key,label,description]]
        - rows: list[dict[paper_id,title,year,values]]
    """
    if not papers:
        return {"columns": DEFAULT_COLUMNS, "rows": []}

    normalized_papers = papers[:12]
    columns = await _discover_schema(llm_call, normalized_papers)

    try:
        rows = await _extract_rows(llm_call, normalized_papers, columns)
    except Exception as exc:
        logger.warning("Dynamic row extraction failed: %s", exc)
        rows = []

    # Fallback row mapping if extraction failed completely.
    if not rows:
        fallback_rows: list[dict[str, Any]] = []
        for paper in normalized_papers:
            fallback_rows.append({
                "paper_id": paper.get("id", ""),
                "title": paper.get("title", "Untitled"),
                "year": paper.get("year") or paper.get("published_date") or paper.get("published"),
                "values": {col["key"]: "N/A" for col in columns},
            })
        rows = fallback_rows

    return {
        "columns": columns,
        "rows": rows,
    }
