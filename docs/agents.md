# Agentic System (OpenResearch)

This document describes the agentic research system currently implemented in the OpenResearch AI service. It explains architecture, agents, orchestration, memory, tool integration, API endpoints, and configuration.

## Overview

The agentic system is implemented as a LangGraph-based orchestration layer inside the AI service. It coordinates a set of specialized agents that run on top of Groq LLMs and can optionally use:
- **Mem0** for memory (with a fallback in-memory store)
- **MCP tool servers** for external tools (academic paper search, analysis, etc.)
- **PGVector** for group-isolated retrieval and artifact embeddings

Core implementation files:
- Orchestration and agents: [ai-service/app/agentic.py](ai-service/app/agentic.py)
- Agentic endpoint: [ai-service/app/main.py](ai-service/app/main.py)
- Request/response schemas: [ai-service/app/models.py](ai-service/app/models.py)
- Memory adapter: [ai-service/app/memory.py](ai-service/app/memory.py)
- MCP client: [ai-service/app/mcp_client.py](ai-service/app/mcp_client.py)
- Configuration: [ai-service/app/config.py](ai-service/app/config.py)

## Architecture

### Components

1. **FastAPI AI Service**
   - Exposes all AI endpoints including `/agentic/run`.
   - Initializes Groq, embeddings, database, vector store, and agentic service on startup.

2. **LangGraph Orchestration**
   - A graph of specialized agent nodes.
   - Routes based on `task_type` to a single agent, then returns.
   - Graph compiled once at startup.

3. **Memory Layer (Mem0)**
   - Uses Mem0 if configured; otherwise falls back to in-memory storage.
   - Stores and retrieves user memory by `user_id` (and optional `group_id`).

4. **MCP Tooling**
   - Optional HTTP client to MCP servers defined by `MCP_SERVER_URLS`.
   - Currently used by the paper retrieval agent when the Academic Papers MCP server is configured.

5. **Persistence & Retrieval**
   - Agent outputs are stored as AI artifacts in the database.
   - If the vector store is available, embeddings are stored in group-isolated vectors for future RAG.

## Agent Routing and State

### State Schema
The orchestration state is a TypedDict in [ai-service/app/agentic.py](ai-service/app/agentic.py):
- `task_type` (string)
- `prompt`, `query`
- `group_id`, `user_id`, `session_id`
- `paper_ids`, `papers`
- `literature_review`, `research_gaps`, `fact_check`, `novelty`
- `mentor_advice`, `paper_draft`, `research_plan`, `deep_research`
- `memory_context`, `result`, `artifacts`, `metadata`, `errors`

### Routing
The `task_type` determines which agent runs:
- `paper_retrieval`
- `literature_survey`
- `gap_analysis`
- `fact_check`
- `novelty_assessment`
- `research_mentor`
- `paper_writing`
- `research_planning`
- `deep_research`

If `task_type` is missing or empty, the system defaults to `literature_survey`.

## Agent Behaviors

### 1) Paper Retrieval Agent
- **Goal**: Fetch and rank relevant papers.
- **MCP**: Uses `academic_papers` MCP server if configured (tool: `search_arxiv`).
- **Fallback**: Uses group papers from the database.
- **Output**: `papers` list and a short summary in `result`.

### 2) Literature Survey Agent
- **Goal**: Synthesize a structured literature review.
- **Inputs**: Retrieved or group papers; user memory context.
- **Output**: `literature_review` text and artifact storage.
- **Memory**: Adds summary to Mem0.

### 3) Gap Analysis Agent
- **Goal**: Identify research gaps and opportunities.
- **Inputs**: Literature review + papers.
- **Output**: `research_gaps` list and artifact storage.
- **Memory**: Adds gaps summary to Mem0.

### 4) Fact-Checking Agent
- **Goal**: Verify claims with available context.
- **Inputs**: Prompt + memory context.
- **Output**: `fact_check` analysis and artifact storage.

### 5) Novelty Assessment Agent
- **Goal**: Assess novelty of an idea vs existing papers.
- **Inputs**: Prompt + papers.
- **Output**: `novelty` analysis and artifact storage.

### 6) Research Mentor Agent
- **Goal**: Provide mentoring advice and next steps.
- **Inputs**: Prompt + memory context.
- **Output**: `mentor_advice` and artifact storage.
- **Memory**: Adds advice to Mem0.

### 7) Paper Writing Agent
- **Goal**: Draft an outline and starter content.
- **Inputs**: Prompt + reference papers.
- **Output**: `paper_draft` and artifact storage.

### 8) Research Planning Agent
- **Goal**: Produce a milestone-based research plan.
- **Inputs**: Prompt + memory context.
- **Output**: `research_plan` and artifact storage.
- **Memory**: Adds plan to Mem0.

### 9) Deep Research Agent (Open Deep Research-style)
- **Goal**: Multi-step deep research with planning, search, summarization, compression, and final report.
- **Inputs**: Prompt + optional group context.
- **Flow**:
   1. **Plan** search queries (LLM-generated list).
   2. **Search** using MCP and/or vector store (configurable).
   3. **Summarize** sources into bullet summaries with citations.
   4. **Compress** summaries into structured notes.
   5. **Report** final synthesis with citations and sections.
- **Output**: `deep_research`, `sources`, `research_notes`, `research_plan`.

## API: Agentic Endpoint

### POST /agentic/run
Defined in [ai-service/app/main.py](ai-service/app/main.py) with schemas in [ai-service/app/models.py](ai-service/app/models.py).

**Request** (`AgenticRunRequest`):
- `task_type` (required, one of the agent types above)
- `prompt` (required, must include `@ai`)
- `group_id` (optional)
- `user_id` (optional but recommended for memory)
- `session_id` (optional)
- `paper_ids` (optional)
- `options` (optional)

**Response** (`AgenticRunResponse`):
- `task_type`
- `result` (agent output payload)
- `artifacts` (IDs stored in DB if `group_id` + DB available)
- `metadata`
- `latency_ms`

**Trigger requirement**: `prompt` must contain `@ai`, enforced by both request validation and endpoint logic.

## Data Persistence and RAG

Artifacts are stored via database methods in [ai-service/app/database.py](ai-service/app/database.py):
- `store_ai_artifact()` for agent outputs.

If the vector store is configured, artifacts are also embedded and stored in `group_paper_vectors` for RAG. See [ai-service/app/vector_store.py](ai-service/app/vector_store.py).

## Memory (Mem0)

Mem0 is optional and configured via environment settings. The adapter lives in [ai-service/app/memory.py](ai-service/app/memory.py).

- If Mem0 is not installed or not configured, the system uses an in-memory fallback store.
- Memory is stored and retrieved per `user_id` and optionally `group_id`.

## MCP Tool Integration

MCP servers are optional and configured with a JSON map in `MCP_SERVER_URLS`. The MCP client is in [ai-service/app/mcp_client.py](ai-service/app/mcp_client.py).

Example (env value):
```
{"academic_papers":"http://localhost:9010"}
```

When configured, the Paper Retrieval Agent calls:
- `academic_papers` → tool `search_arxiv`

If not configured, it falls back to group papers in the database.

## Configuration

Settings in [ai-service/app/config.py](ai-service/app/config.py):
- `GROQ_API_KEY`, `GROQ_MODEL`
- `DATABASE_URL`
- `MEM0_ENABLED`, `MEM0_DATABASE_URL`, `MEM0_COLLECTION`
- `MCP_SERVER_URLS`, `MCP_REQUEST_TIMEOUT`
 - Deep research model routing:
    - `SUMMARIZATION_MODEL`, `RESEARCH_MODEL`, `COMPRESSION_MODEL`, `FINAL_REPORT_MODEL`
 - Deep research search settings:
    - `SEARCH_API` (tavily | mcp | vector_store | hybrid)
    - `MCP_SEARCH_SERVER`, `MCP_SEARCH_TOOL`
    - `MAX_SEARCH_QUERIES`, `MAX_SEARCH_RESULTS`, `MAX_SOURCE_SUMMARIES`
 - Tavily:
    - `TAVILY_API_KEY`, `TAVILY_SEARCH_DEPTH`, `TAVILY_INCLUDE_ANSWER`

## Dependencies

The agentic layer relies on these key packages:
- `langgraph`, `langchain-core`, `langchain-groq`
- `mem0ai` (optional)
- `groq`

See [ai-service/pyproject.toml](ai-service/pyproject.toml) and [ai-service/requirements.txt](ai-service/requirements.txt).

## Current Limitations

1. **No UI integration**: The UI does not call `/agentic/run` yet.
2. **MCP is optional**: Without configured MCP servers, agents use fallback logic.
3. **Mem0 is optional**: If not configured, memory is not persisted across restarts.
4. **Single-agent execution**: The current graph routes to a single agent per request.

## How to Call

Use the AI service endpoint directly:
- `POST /agentic/run`
- `prompt` must include `@ai`
- `task_type` selects the agent

The server can also call this via the TypeScript client in [server/src/services/aiClient.ts](server/src/services/aiClient.ts).
