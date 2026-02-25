"""Web search tool using Tavily API for research-focused web results."""

import os
import logging
import httpx

logger = logging.getLogger(__name__)

TAVILY_API_URL = "https://api.tavily.com/search"


async def search_web(query: str, limit: int = 5) -> dict:
    """
    Search the web using Tavily API.

    Returns dict with 'results' list. Each result has:
    - title, url, snippet, source ('web')

    If no API key is configured, returns empty results gracefully.
    """
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        logger.debug("TAVILY_API_KEY not set – skipping web search")
        return {"results": [], "count": 0}

    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": limit,
        "search_depth": "basic",
        "include_answer": False,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                TAVILY_API_URL, json=payload
            )
            response.raise_for_status()
            data = response.json()

        results = []
        for item in data.get("results", [])[:limit]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("content", ""),
                "source": "web",
            })

        return {"results": results, "count": len(results)}

    except Exception as exc:
        logger.warning("Web search failed for query %r: %s", query, exc)
        return {"results": [], "count": 0}
