import asyncio
import httpx
import json

async def test():
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            "http://localhost:8000/agentic/run",
            json={
                "task_name": "Literature Survey",
                "query": "What are the latest findings on RLHF?",
                "group_id": "1",
                "user_id": "1",
                "history": []
            }
        )
        print("Status code:", response.status_code)
        print("Response:", json.dumps(response.json(), indent=2) if response.status_code == 200 else response.text)

if __name__ == "__main__":
    asyncio.run(test())
