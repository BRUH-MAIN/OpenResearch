#!/usr/bin/env bash
cd /home/harikarthik/Documents/projects/OpenResearch/ai-service
exec /home/harikarthik/Documents/projects/OpenResearch/ai-service/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
