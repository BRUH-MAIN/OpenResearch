"""arXiv search, for finding papers the group does not already have.

Parsed with the standard library rather than feedparser: the response is a small
Atom document and pulling in a dependency for it is not worth the image space.
"""

import logging
import xml.etree.ElementTree as ET
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

ARXIV_API = "https://export.arxiv.org/api/query"
ATOM = "{http://www.w3.org/2005/Atom}"

# arXiv AND-joins terms, so a raw question ("what are the recent methods for...")
# becomes a query so restrictive it matches nothing. Strip the filler first.
_STOP_WORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "if", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "it", "its", "that", "this", "these",
    "those", "what", "which", "who", "how", "when", "where", "why", "not",
    "no", "so", "than", "too", "very", "just", "about", "after", "before",
    "between", "into", "through", "during", "out", "over", "under", "again",
    "then", "there", "all", "each", "both", "few", "more", "most", "other",
    "some", "such", "only", "same", "also", "any", "up", "down", "i", "me",
    "my", "we", "our", "you", "your", "they", "their", "recent", "latest",
    "new", "using", "based", "papers", "paper", "research", "work", "study",
})


def _clean_query(raw: str) -> str:
    """Turn a natural-language query into something arXiv will actually match."""
    # If the caller wrote a real query, respect it.
    if " AND " in raw or " OR " in raw or '"' in raw:
        return raw

    tokens = [t.strip(".,?!:;()") for t in raw.split()]
    meaningful = [t for t in tokens if t.lower() not in _STOP_WORDS and len(t) > 1]

    if not meaningful:
        meaningful = [t for t in tokens if len(t) > 1] or tokens

    if len(meaningful) == 1:
        return meaningful[0]

    return " AND ".join(f"all:{t}" for t in meaningful[:6])


def _text(entry: ET.Element, tag: str) -> str:
    node = entry.find(f"{ATOM}{tag}")
    return (node.text or "").strip().replace("\n", " ") if node is not None else ""


async def search_arxiv(query: str, max_results: int = 5) -> list[dict]:
    """Search arXiv. Returns [{title, authors, abstract, url, published}]."""
    params = {
        "search_query": _clean_query(query),
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(ARXIV_API, params=params)
            response.raise_for_status()
        root = ET.fromstring(response.text)
    except Exception as exc:
        logger.warning("arXiv search failed for %r: %s", query, exc)
        return []

    papers = []
    for entry in root.findall(f"{ATOM}entry"):
        authors = [
            (a.find(f"{ATOM}name").text or "").strip()
            for a in entry.findall(f"{ATOM}author")
            if a.find(f"{ATOM}name") is not None
        ]
        papers.append({
            "title": _text(entry, "title"),
            "authors": authors[:6],
            "abstract": _text(entry, "summary"),
            "url": _text(entry, "id"),
            "published": _text(entry, "published")[:10],
        })

    return papers
