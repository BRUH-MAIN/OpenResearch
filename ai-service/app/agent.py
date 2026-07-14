"""The research agent: a ReAct loop over three tools.

Why an agent at all, when there is already a RAG chat? Because single-shot RAG
retrieves once and answers. It cannot ask a second question that only becomes
obvious after seeing the first result — "these three papers all evaluate on
ImageNet, but none of them explains the augmentation setup; is there a paper that
does?" That requires acting on an observation, which is what this loop does.

The loop is written out rather than delegated to a framework's prebuilt agent:
it is ~60 lines, it is exactly what the model's native tool-calling gives us, and
every step of it is observable and testable.

Guardrails, because an unbounded agent is a way to spend money on nothing:
  • a hard cap on iterations (MAX_ITERATIONS)
  • tool results truncated before they re-enter the context
  • the final synthesis is a separate call whose prompt *requires* citations, so
    the answer cannot quietly drift away from the evidence it gathered
"""

import json
import logging
from typing import Any, AsyncGenerator, Optional

from .database import database
from .deps import get_group_context
from .llm_client import llm_client
from .tools.arxiv import search_arxiv

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 6
MAX_TOOL_RESULT_CHARS = 3000
MAX_EVIDENCE = 20

AGENT_SYSTEM_PROMPT = """You are a research assistant investigating a question \
for a team of researchers.

You have three tools:
  • search_group_papers — the team's OWN indexed papers. Always start here.
  • search_arxiv — the wider literature, for work the team does not yet have.
  • read_paper — the full text of one of the team's papers, when an abstract is
    not enough and you need the detail.

Work iteratively. Search, read what comes back, and let it tell you what to ask
next. If the team's papers do not cover something the question needs, say so and
go to arXiv for it.

Stop calling tools once you have enough evidence to answer well. Do not call the
same tool with the same arguments twice."""

SYNTHESIS_SYSTEM_PROMPT = """You are a research assistant writing up findings for \
a team of researchers.

Write a clear, structured answer to their question using ONLY the evidence given.

Rules:
  • Cite every substantive claim with a bracketed source number: [1], [2].
  • If the evidence does not answer part of the question, say so plainly. Do not
    fill the gap from your own knowledge.
  • Distinguish what the team's own papers say from what you found on arXiv.
  • Be specific. Prefer the concrete finding over the general summary."""


def _tool_schemas() -> list[dict]:
    """OpenAI-style tool schemas. DeepSeek and Groq both speak this."""
    return [
        {
            "type": "function",
            "function": {
                "name": "search_group_papers",
                "description": (
                    "Search the team's own indexed papers. Hybrid semantic + keyword "
                    "search. Use this first, and use it repeatedly with different "
                    "phrasings as the investigation narrows."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to look for, in natural language.",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_arxiv",
                "description": (
                    "Search arXiv for papers the team does NOT already have. Use when "
                    "the team's own papers do not cover something the question needs."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search terms. Keywords work better than a full question.",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_paper",
                "description": (
                    "Read the full text of one of the team's papers, identified by its "
                    "title. Use when an abstract or a retrieved passage is not enough."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "The paper's title, as it appeared in a search result.",
                        }
                    },
                    "required": ["title"],
                },
            },
        },
    ]


class ResearchAgent:
    """Runs one investigation. Not reused across requests — it holds the evidence."""

    def __init__(self, group_id: str) -> None:
        self.group_id = group_id
        # Everything the agent saw, in order. This becomes the citation list.
        self.evidence: list[dict] = []
        self._seen_calls: set[str] = set()

    # ── tools ────────────────────────────────────────────────────────────

    async def _search_group_papers(self, query: str) -> str:
        chunks, _ = await get_group_context(
            group_id=self.group_id, query=query, limit=6, content_types=["paper"]
        )
        if not chunks:
            return "No matching passages in the team's papers."

        lines = []
        for chunk in chunks:
            index = self._record_evidence(
                title=chunk.get("title") or "Untitled",
                url=chunk.get("url") or "",
                content=chunk["content"],
                origin="group",
                similarity=round(chunk.get("similarity", 0), 3),
            )
            lines.append(
                f"[{index}] {chunk.get('title') or 'Untitled'} — {chunk['content'][:400]}"
            )
        return "\n\n".join(lines)

    async def _search_arxiv(self, query: str) -> str:
        papers = await search_arxiv(query, max_results=4)
        if not papers:
            return "No arXiv results."

        lines = []
        for paper in papers:
            index = self._record_evidence(
                title=paper["title"],
                url=paper["url"],
                content=paper["abstract"],
                origin="arxiv",
            )
            authors = ", ".join(paper["authors"][:3])
            lines.append(
                f"[{index}] {paper['title']} ({authors}, {paper['published']}) — "
                f"{paper['abstract'][:400]}"
            )
        return "\n\n".join(lines)

    async def _read_paper(self, title: str) -> str:
        if not database.is_connected:
            return "The paper store is unavailable."

        papers = await database.get_group_papers(self.group_id)
        wanted = title.lower().strip()

        match = next(
            (p for p in papers if p.get("title", "").lower().strip() == wanted),
            None,
        ) or next(
            (p for p in papers if wanted in p.get("title", "").lower()),
            None,
        )

        if not match:
            available = ", ".join(p.get("title", "?") for p in papers[:8]) or "none"
            return f"No such paper in this group. Available: {available}"

        body = match.get("full_text") or match.get("abstract") or ""
        if not body:
            return f"'{match['title']}' has no stored text. Upload its PDF to read it in full."

        index = self._record_evidence(
            title=match["title"],
            url=match.get("url") or "",
            content=body[:1500],
            origin="group",
        )
        return f"[{index}] Full text of '{match['title']}':\n\n{body[:MAX_TOOL_RESULT_CHARS]}"

    # ── evidence ─────────────────────────────────────────────────────────

    def _record_evidence(
        self,
        title: str,
        url: str,
        content: str,
        origin: str,
        similarity: float = 0.0,
    ) -> int:
        """Record a source and return its citation number (1-based)."""
        # Same passage seen twice keeps its original number, so citations are stable.
        for existing in self.evidence:
            if existing["title"] == title and existing["content"][:200] == content[:200]:
                return existing["n"]

        n = len(self.evidence) + 1
        self.evidence.append({
            "n": n,
            "title": title,
            "url": url,
            "content": content,
            "origin": origin,
            "similarity": similarity,
        })
        return n

    async def _dispatch(self, name: str, args: dict) -> str:
        if name == "search_group_papers":
            return await self._search_group_papers(args.get("query", ""))
        if name == "search_arxiv":
            return await self._search_arxiv(args.get("query", ""))
        if name == "read_paper":
            return await self._read_paper(args.get("title", ""))
        return f"Unknown tool: {name}"

    # ── the loop ─────────────────────────────────────────────────────────

    async def run(self, question: str) -> AsyncGenerator[dict, None]:
        """Investigate, yielding an event per step, then stream the answer.

        Events:
          {"step": {...}}         the agent decided to call a tool
          {"observation": {...}}  the tool came back
          {"token": "..."}        a token of the final answer
          {"done": true, ...}     finished, with the sources to cite
        """
        from langchain_core.messages import (
            AIMessage,
            HumanMessage,
            SystemMessage,
            ToolMessage,
        )

        llm = llm_client.bind_tools(_tool_schemas())

        messages: list[Any] = [
            SystemMessage(content=AGENT_SYSTEM_PROMPT),
            HumanMessage(content=question),
        ]

        iterations = 0

        for iterations in range(1, MAX_ITERATIONS + 1):
            response = await llm.ainvoke(messages)
            tool_calls = getattr(response, "tool_calls", None) or []

            if not tool_calls:
                # The model is satisfied. Stop and synthesize.
                break

            messages.append(response)

            for call in tool_calls:
                name = call.get("name", "")
                args = call.get("args", {}) or {}

                signature = f"{name}:{json.dumps(args, sort_keys=True)}"
                if signature in self._seen_calls:
                    result = "You already ran this exact search. Try a different angle, or stop and answer."
                else:
                    self._seen_calls.add(signature)
                    yield {"step": {"n": iterations, "tool": name, "args": args}}
                    try:
                        result = await self._dispatch(name, args)
                    except Exception as exc:
                        logger.warning("Tool %s failed: %s", name, exc)
                        result = f"The tool failed: {exc}"

                    yield {
                        "observation": {
                            "n": iterations,
                            "tool": name,
                            "summary": result[:180],
                            "sources_so_far": len(self.evidence),
                        }
                    }

                messages.append(
                    ToolMessage(
                        content=result[:MAX_TOOL_RESULT_CHARS],
                        tool_call_id=call.get("id", ""),
                    )
                )
        else:
            # Cap reached: answer with whatever was gathered rather than looping on.
            yield {
                "observation": {
                    "n": iterations,
                    "tool": "-",
                    "summary": f"Reached the {MAX_ITERATIONS}-step limit; answering with what I have.",
                    "sources_so_far": len(self.evidence),
                }
            }

        # ── synthesis: a separate call, whose prompt demands citations ──
        yield {"step": {"n": iterations + 1, "tool": "synthesize", "args": {}}}

        evidence_block = "\n\n".join(
            f"[{e['n']}] ({e['origin']}) {e['title']}\n{e['content'][:800]}"
            for e in self.evidence[:MAX_EVIDENCE]
        ) or "No evidence was found."

        synthesis_prompt = f"""Question: {question}

Evidence:
{evidence_block}

Write the answer. Cite with [n]."""

        async for token in llm_client.generate_stream(
            prompt=synthesis_prompt,
            system_instruction=SYNTHESIS_SYSTEM_PROMPT,
            temperature=0.3,
        ):
            yield {"token": token}

        yield {
            "done": True,
            "iterations": iterations,
            "sources": [
                {
                    "id": f"agent-{e['n']}",
                    "type": e["origin"],
                    "title": e["title"],
                    "url": e["url"],
                    "similarity": e["similarity"],
                }
                for e in self.evidence[:MAX_EVIDENCE]
            ],
        }
