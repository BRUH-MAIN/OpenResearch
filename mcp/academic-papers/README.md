# OpenResearch MCP Academic Papers

MCP server that exposes academic paper search tools.

## Tools
- `search_arxiv`
- `search_semantic_scholar`

## Endpoints
- `POST /tools/search_arxiv`
- `POST /tools/search_semantic_scholar`
- `POST /invoke` (generic MCP-style invocation)
- `GET /health`

## Run
```bash
uvicorn main:app --host 0.0.0.0 --port 9010
```

## Environment
- `SEMANTIC_SCHOLAR_API_KEY` (optional, required for Semantic Scholar)

## AI Service Integration
Set MCP_SERVER_URLS in ai-service:
```json
{"academic_papers":"http://localhost:9010"}
```
