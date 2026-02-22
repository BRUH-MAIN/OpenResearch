import asyncio
import os
import sys

# Ensure we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.agentic import AgenticService

async def main():
    try:
        print("Initializing AgenticService...")
        service = AgenticService()
        service.initialize()
        
        print("\nRunning literature_survey task for 'quantum computing'...")
        result = await service.run_task(
            task="literature_survey",
            request={
                "prompt": "quantum computing",
                "group_id": "test_group_123",
                "session_id": "test_session_123",
                "user_id": "test_user_123"
            }
        )
        
        print("\n--- Result ---")
        if "result" in result and "final_response" in result["result"]:
            print(result["result"]["final_response"])
        else:
            print("FULL RAW RESULT:", result)
        
    except Exception as e:
        print(f"\n--- Error ---")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
