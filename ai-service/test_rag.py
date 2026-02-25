import asyncio
import os
from dotenv import load_dotenv

# load environment before importing app
load_dotenv()

from app.agentic import agentic_service
from app.database import database

async def main():
    await database.connect()
    
    agentic_service.initialize()
    request = {
        "prompt": "Tabular literature review on recent advancements in text-to-speech models.",
        "group_id": "test_group_tts"
    }
    
    print("Starting stream...")
    async for chunk in agentic_service.stream_task_events("literature_survey", request):
        print(f"CHUNK: {chunk.strip()}")

    await database.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
