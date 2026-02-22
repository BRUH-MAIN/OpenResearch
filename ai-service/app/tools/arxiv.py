"""Native Python tool for retrieving academic papers from ArXiv via HTTP."""

import httpx
import feedparser

ARXIV_API = "https://export.arxiv.org/api/query"

async def search_arxiv(query: str, limit: int = 10) -> dict:
    """Search ArXiv for papers matching the given query."""
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": limit,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(ARXIV_API, params=params)
        response.raise_for_status()

    feed = feedparser.parse(response.text)
    papers = []

    for entry in feed.entries:
        paper = {
            "id": entry.get("id"),
            "title": (entry.get("title") or "").replace("\n", " ").strip(),
            "abstract": (entry.get("summary") or "").replace("\n", " ").strip(),
            "authors": [a.name for a in entry.get("authors", [])],
            "url": entry.get("link"),
            "published": entry.get("published"),
            "source": "arxiv",
        }
        papers.append(paper)

    return {"papers": papers, "count": len(papers)}
