import sys, asyncio, traceback
try:
    from app.main import lifespan
    asyncio.run(lifespan(None).__aenter__())
except Exception as e:
    with open('crash.log', 'w') as f:
        f.write(traceback.format_exc())
