"""Native Python tool for retrieving academic papers from ArXiv via HTTP."""

import httpx
import feedparser

ARXIV_API = "https://export.arxiv.org/api/query"

# Common English stop words to strip from queries before AND-joining.
# Leaving these in causes overly restrictive queries that return 0 results.
_STOP_WORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "if", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought", "used",
    "it", "its", "that", "this", "these", "those", "what", "which", "who",
    "whom", "how", "when", "where", "why", "not", "no", "nor", "so", "than",
    "too", "very", "just", "about", "above", "after", "before", "between",
    "into", "through", "during", "out", "off", "over", "under", "again",
    "further", "then", "once", "here", "there", "all", "each", "every",
    "both", "few", "more", "most", "other", "some", "such", "only", "own",
    "same", "also", "any", "up", "down", "i", "me", "my", "we", "our",
    "you", "your", "he", "him", "his", "she", "her", "they", "them", "their",
    "recent", "latest", "new", "using", "based",
})


def _clean_query(raw: str) -> str:
    """Strip stop words and build a clean AND-joined ArXiv query.

    If the caller already uses explicit boolean operators (AND / OR) or
    quoted phrases, the query is returned as-is.
    """
    if " AND " in raw or " OR " in raw or '"' in raw:
        return raw

    tokens = raw.split()
    meaningful = [t for t in tokens if t.lower() not in _STOP_WORDS and len(t) > 1]

    # Fall back to original tokens if stripping removed everything
    if not meaningful:
        meaningful = [t for t in tokens if len(t) > 1] or tokens

    if len(meaningful) == 1:
        return meaningful[0]

    return " AND ".join(meaningful)


async def search_arxiv(
    query: str, 
    limit: int = 10, 
    sort_by: str = "relevance",
    start_date: str = None,
    end_date: str = None
) -> dict:
    """Search ArXiv for papers matching the given query.
    start_date and end_date should be in YYYY-MM-DD format.
    """
    # Clean the query: strip stop words, then AND-join meaningful terms
    query = _clean_query(query)

    if start_date or end_date:
        start_str = start_date.replace("-", "") + "0000" if start_date else "190001010000"
        end_str = end_date.replace("-", "") + "2359" if end_date else "210001012359"
        query = f"all:({query}) AND submittedDate:[{start_str} TO {end_str}]"
        
    params = {
        "search_query": query if query.startswith("all:") else f"all:({query})",
        "start": 0,
        "max_results": limit,
        "sortBy": sort_by,
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
