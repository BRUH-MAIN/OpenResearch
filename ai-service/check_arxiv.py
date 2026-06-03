import asyncio
from app.tools.arxiv import search_arxiv

async def main():
    print("Testing submittedDate sort with automatic AND insertion (limit=3):")
    res = await search_arxiv("image edit models", limit=3, sort_by="submittedDate")
    for p in res["papers"]:
        print(f" - {p['title']} ({p.get('published')})")

if __name__ == "__main__":
    asyncio.run(main())
