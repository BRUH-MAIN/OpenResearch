"""Academic Papers MCP Server (ArXiv + Semantic Scholar)."""

from __future__ import annotations

import os
from typing import Any, Optional

import feedparser
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ARXIV_API = "http://export.arxiv.org/api/query"
S2_API = "https://api.semanticscholar.org/graph/v1/paper/search"


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=300)
    limit: int = Field(10, ge=1, le=50)


class ToolInvokeRequest(BaseModel):
    tool: str
    params: dict[str, Any]


app = FastAPI(
    title="OpenResearch MCP Academic Papers",
    version="0.1.0",
    description="MCP server for academic paper search",
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/invoke")
async def invoke_tool(request: ToolInvokeRequest) -> dict:
    tool = request.tool
    params = request.params

    if tool == "search_arxiv":
        return await search_arxiv(SearchRequest(**params))
    if tool == "search_semantic_scholar":
        return await search_semantic_scholar(SearchRequest(**params))

    raise HTTPException(status_code=404, detail=f"Unknown tool: {tool}")


@app.post("/tools/search_arxiv")
async def search_arxiv(request: SearchRequest) -> dict:
    params = {
        "search_query": f"all:{request.query}",
        "start": 0,
        "max_results": request.limit,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    async with httpx.AsyncClient(timeout=20) as client:
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


@app.post("/tools/search_semantic_scholar")
async def search_semantic_scholar(request: SearchRequest) -> dict:
    api_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    headers = {"x-api-key": api_key} if api_key else {}

    params = {
        "query": request.query,
        "limit": request.limit,
        "fields": "title,abstract,authors,year,url,venue,publicationTypes",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(S2_API, params=params, headers=headers)
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Semantic Scholar API key required")
        response.raise_for_status()

    payload = response.json()
    data = payload.get("data", [])

    papers = []
    for entry in data:
        papers.append(
            {
                "id": entry.get("paperId"),
                "title": entry.get("title"),
                "abstract": entry.get("abstract"),
                "authors": [a.get("name") for a in entry.get("authors", [])],
                "url": entry.get("url"),
                "published": entry.get("year"),
                "venue": entry.get("venue"),
                "source": "semantic_scholar",
            }
        )

    return {"papers": papers, "count": len(papers)}
