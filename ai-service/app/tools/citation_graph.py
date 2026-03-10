"""Citation Graph Builder — constructs a graph of citation relationships between papers.

Enhanced with:
- Claim extraction from synthesis text
- Claim-source verification (supports/contradicts edges)
- Semantic similarity edges between sources
"""

from __future__ import annotations

import logging
import re
import math
from typing import Any, Optional

logger = logging.getLogger(__name__)


def build_citation_graph(
    sources: list[dict[str, Any]],
    synthesis_text: str = "",
    claims: Optional[list[dict[str, Any]]] = None,
    embeddings: Optional[dict[str, list[float]]] = None,
    similarity_threshold: float = 0.75,
) -> dict[str, Any]:
    """Build a citation graph from gathered sources and synthesis text.

    Each source becomes a node. Edges are derived from:
      1. Explicit citations in synthesis text referencing numbered sources.
      2. Shared topics / co-citation proximity (if two sources are cited
         in the same sentence or paragraph, they share an edge).
      3. Claim verification edges (supports / contradicts) between claims
         and their source evidence.
      4. Semantic similarity edges between sources with high embedding cosine
         similarity.

    Args:
        sources: list of source dicts from _gather_context.
        synthesis_text: the final synthesis / research report.
        claims: optional list of extracted claims with verification info:
                [{"id", "text", "source_sids", "verdict", "excerpt"}]
        embeddings: optional dict mapping source sid → embedding vector for
                    computing semantic similarity edges.
        similarity_threshold: cosine similarity threshold above which to add
                              a "similar" edge between two sources.

    Returns:
        {
          "nodes": [...],
          "edges": [...],
          "claims": [...]   # extracted/verified claims if provided
        }
    """

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    # ── Build nodes from sources ──
    sid_to_idx: dict[str, int] = {}
    for i, src in enumerate(sources):
        sid = src.get("sid", f"s{i}")
        sid_to_idx[sid] = i
        nodes.append({
            "id": sid,
            "label": _truncate(src.get("title", sid), 60),
            "type": src.get("type", "unknown"),  # vector_store | web | arxiv
            "url": src.get("url", ""),
            "authors": src.get("authors", ""),
            "year": src.get("year", ""),
            "group": src.get("type", "unknown"),
        })

    # ── Extract citation numbers from synthesis text ──
    citation_pattern = re.compile(r"\[\[(\d+)\]\]\([^)]+\)")

    num_to_sid: dict[int, str] = {}
    for src in sources:
        sid = src.get("sid", "")
        m = re.match(r"s(\d+)", sid)
        if m:
            num_to_sid[int(m.group(1)) + 1] = sid

    # Parse sentences to find co-citations
    if synthesis_text:
        sentences = re.split(r"(?<=[.!?])\s+", synthesis_text)
        for sent in sentences:
            cited_nums = [int(m) for m in citation_pattern.findall(sent)]
            cited_sids = [num_to_sid[n] for n in cited_nums if n in num_to_sid]

            for i in range(len(cited_sids)):
                for j in range(i + 1, len(cited_sids)):
                    sid_a, sid_b = cited_sids[i], cited_sids[j]
                    if sid_a != sid_b:
                        edges.append({
                            "source": sid_a,
                            "target": sid_b,
                            "type": "co_cited",
                            "label": "co-cited",
                        })

    # ── Infer "cites" edges based on arXiv references ──
    for i, src_a in enumerate(sources):
        content_a = src_a.get("content", "") + " " + src_a.get("title", "")
        for j, src_b in enumerate(sources):
            if i == j:
                continue
            paper_id_b = src_b.get("paper_id", "")
            if paper_id_b and paper_id_b in content_a:
                edges.append({
                    "source": src_a.get("sid", f"s{i}"),
                    "target": src_b.get("sid", f"s{j}"),
                    "type": "cites",
                    "label": "cites",
                })

    # ── Claim verification edges ──
    output_claims: list[dict[str, Any]] = []
    if claims:
        for claim in claims:
            claim_id = claim.get("id", f"claim_{len(output_claims)}")
            claim_text = claim.get("text", "")
            verdict = claim.get("verdict", "neutral")  # supports | contradicts | neutral
            excerpt = claim.get("excerpt", "")
            source_sids = claim.get("source_sids", [])

            # Add claim as a node
            nodes.append({
                "id": claim_id,
                "label": _truncate(claim_text, 60),
                "type": "claim",
                "url": "",
                "authors": "",
                "year": "",
                "group": "claim",
                "verdict": verdict,
            })

            # Connect claim to its supporting/contradicting sources
            for sid in source_sids:
                if sid in sid_to_idx or sid == "synthesis":
                    edge_type = "supports" if verdict == "supports" else (
                        "contradicts" if verdict == "contradicts" else "relates_to"
                    )
                    edges.append({
                        "source": claim_id,
                        "target": sid,
                        "type": edge_type,
                        "label": edge_type.replace("_", " "),
                        "excerpt": excerpt,
                    })

            output_claims.append({
                "id": claim_id,
                "text": claim_text,
                "verdict": verdict,
                "excerpt": excerpt,
                "source_sids": source_sids,
            })

    # ── Semantic similarity edges ──
    if embeddings and len(embeddings) >= 2:
        sids_with_emb = [(sid, emb) for sid, emb in embeddings.items() if sid in sid_to_idx]
        for i in range(len(sids_with_emb)):
            for j in range(i + 1, len(sids_with_emb)):
                sid_a, emb_a = sids_with_emb[i]
                sid_b, emb_b = sids_with_emb[j]
                sim = _cosine_similarity(emb_a, emb_b)
                if sim >= similarity_threshold:
                    edges.append({
                        "source": sid_a,
                        "target": sid_b,
                        "type": "similar",
                        "label": f"similar ({sim:.2f})",
                        "weight": round(sim, 3),
                    })

    # ── Deduplicate edges ──
    seen_edges: set[tuple[str, str, str]] = set()
    unique_edges: list[dict[str, Any]] = []
    for edge in edges:
        key = (edge["source"], edge["target"], edge["type"])
        rev_key = (edge["target"], edge["source"], edge["type"])
        if key not in seen_edges and rev_key not in seen_edges:
            seen_edges.add(key)
            unique_edges.append(edge)

    # Add a central "synthesis" node if we have synthesis text
    if synthesis_text and nodes:
        nodes.append({
            "id": "synthesis",
            "label": "Research Synthesis",
            "type": "synthesis",
            "url": "",
            "authors": "",
            "year": "",
            "group": "synthesis",
        })
        for src in sources:
            sid = src.get("sid", "")
            unique_edges.append({
                "source": "synthesis",
                "target": sid,
                "type": "derives_from",
                "label": "derives from",
            })

    return {"nodes": nodes, "edges": unique_edges, "claims": output_claims}


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if len(a) != len(b) or len(a) == 0:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _truncate(text: str, max_len: int) -> str:
    """Truncate text to max_len characters, appending '…' if trimmed."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"
