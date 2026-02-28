import asyncio
from app.tools.arxiv import search_arxiv
import sys

async def main():
    # Test arxiv date range syntax
    # ArXiv syntax: submittedDate:[YYYYMMDDHHMMSS TO YYYYMMDDHHMMSS]
    q = "all:\"image edit models\" AND submittedDate:[201801010000 TO 202012312359]"
    print(f"Querying: {q}")
    # We will override search_query locally in arxiv.py for this test
    # actually wait, search_arxiv does f"all:{query}"
    # so we can pass: "\"image edit models\" AND submittedDate:[20180101 TO 20201231]" 
    # Let's try it:
    query = '"image edit" AND submittedDate:[201801010000 TO 202012312359]'
    res = await search_arxiv(query, limit=5, sort_by="submittedDate")
    print(f"Found {res['count']} papers")
    for p in res["papers"]:
        print(f" - {p['title']} ({p.get('published')})")

if __name__ == "__main__":
    asyncio.run(main())
