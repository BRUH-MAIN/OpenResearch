import asyncio
import os
import sys

# Setup environment to run the FastAPI app context
sys.path.append(os.path.join(os.path.dirname(__file__), "app"))

from app.agentic import agentic_service

async def main():
    agentic_service.initialize()
    
    # Simulate the exact query
    request = {
        "prompt": "Find recent papers on RAG architecture and show the research gaps.",
        "group_id": "test_group_id",
        "user_id": "test_user_id"
    }
    
    # We pass 'auto' to emulate the real endpoint flow
    result = await agentic_service.run_task("auto", request)
    print("\n\n=== FINAL RESULT ===")
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
