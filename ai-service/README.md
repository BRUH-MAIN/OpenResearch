# OpenResearch AI Service

FastAPI service providing AI-powered features for OpenResearch using Groq (Llama 3.3 70B) for chat and OpenAI for embeddings. Implements group-isolated RAG (Retrieval-Augmented Generation) with pgvector for semantic search.

## 🎯 Features

- **Group AI Chat** - Answer questions with group-isolated RAG context (all group papers + discussions)
- **Paper Q&A** - Answer specific questions about papers in a group's collection
- **Paper Summarization** - Generate summaries with key points extraction
- **Semantic Search** - pgvector-powered semantic similarity search across group papers (1536-dim embeddings)
- **Group-Isolated Context** - Each group has completely isolated vector space and context (no data leakage)
- **PDF Report Generation** - Generate research activity reports with ReportLab
- **Health Checks** - Monitor service and dependency status
- **Async Operations** - Non-blocking I/O with asyncio and SQLAlchemy
- **Session Context** - Pull session messages and linked papers from PostgreSQL for RAG

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Service                          │
│                     (Port 8000)                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HTTP Endpoints                                     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  POST /groups/{group_id}/ai-chat       - RAG Chat   │   │
│  │  POST /papers/question                 - Q&A       │   │
│  │  POST /papers/summarize                - Summary   │   │
│  │  POST /vectors/search                  - Similarity│   │
│  │  POST /reports/group/{group_id}/generate - PDF     │   │
│  │  GET  /health                          - Health    │   │
│  └─────────────────────────────────────────────────────┘   │
│                        │                                    │
│         ┌──────────────┼──────────────┬──────────────┐      │
│         ▼              ▼              ▼              ▼      │
│    ┌─────────┐   ┌──────────┐  ┌─────────┐  ┌──────────┐   │
│    │  Groq   │   │ OpenAI   │  │PostgreSQL  │ReportLab │   │
│    │ API     │   │Embeddings│  │+ pgvector  │ (PDF)    │   │
│    │(Llama   │   │  Service │  │ (Vector)   │          │   │
│    │3.3 70B) │   │          │  │            │          │   │
│    └─────────┘   └──────────┘  └─────────┘  └──────────┘   │
│                                                             │
│  Group-Isolated Context:                                   │
│  ├─ Papers (embedded in group_paper_vectors)              │
│  ├─ Summaries (stored with metadata)                      │
│  ├─ Q&A pairs (stored with metadata)                      │
│  ├─ Memory notes (embeddable)                             │
│  └─ Reports (group-specific)                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Technologies:**
- **FastAPI** - Modern async web framework with automatic OpenAPI docs
- **Groq** - Fast LLM inference (Llama 3.3 70B)
- **OpenAI** - Embeddings service (1536-dimensional vectors)
- **PostgreSQL 16** - Database with pgvector extension
- **SQLAlchemy** - Async ORM for database operations
- **ReportLab** - PDF generation
- **Pydantic** - Request/response validation

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd ai-service

# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env  # Edit required variables
```

**Required variables:**
- `GROQ_API_KEY` - Get from [Groq Console](https://console.groq.com/keys)
- `DATABASE_URL` - PostgreSQL connection string (same as server)
- `OPENAI_API_KEY` - Get from [OpenAI API Keys](https://platform.openai.com/api-keys)

**Optional variables:**
- `GROQ_MODEL` - Default: `llama-3.3-70b-versatile`
- `EMBEDDING_MODEL` - Default: `text-embedding-3-small`
- `EMBEDDING_DIMENSIONS` - Default: `1536`
- `DEBUG` - Default: `false`

**Example `.env`:**
```env
GROQ_API_KEY=gsk_your_key_here
OPENAI_API_KEY=sk-your_key_here
DATABASE_URL=postgresql://postgres:password@localhost:5432/openresearch
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
DEBUG=false
MAX_CONTEXT_MESSAGES=50
MAX_CONTEXT_TOKENS=8000
REQUEST_TIMEOUT=30
```

### 3. Run the Service

```bash
# Development mode with auto-reload
uvicorn app.main:app --reload --port 8000

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 4. Access Documentation

- **Swagger UI**: http://localhost:8000/docs (Interactive API explorer)
- **ReDoc**: http://localhost:8000/redoc (Alternative documentation)
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## 📚 API Documentation

See [Root README](../README.md#-api-documentation) for comprehensive API documentation.

### Key Endpoints

#### Group AI Chat (RAG)
```
POST /groups/{group_id}/ai-chat

Request:
{
  "prompt": "@ai What papers in our group discuss transformers?",
  "session_id": "optional-uuid"
}

Response:
{
  "answer": "Based on your group's papers...",
  "group_id": "group-uuid",
  "context_used": {
    "messages": 5,
    "papers": 3,
    "memory_notes": 1
  }
}
```

#### Paper Question & Answer
```
POST /papers/question

Request:
{
  "paper_id": "arxiv:2312.xxxxx",
  "group_id": "group-uuid",
  "question": "@ai What is the main contribution?"
}

Response:
{
  "answer": "The main contribution is...",
  "paper_id": "arxiv:2312.xxxxx",
  "group_id": "group-uuid"
}
```

#### Paper Summarization
```
POST /papers/summarize

Request:
{
  "paper_id": "arxiv:2312.xxxxx",
  "group_id": "group-uuid"
}

Response:
{
  "summary": "## Summary\n\n...",
  "key_points": ["...", "..."],
  "paper_id": "arxiv:2312.xxxxx"
}
```

#### Semantic Vector Search
```
POST /vectors/search

Request:
{
  "group_id": "group-uuid",
  "query": "transformer architecture improvements",
  "limit": 5,
  "content_types": ["paper", "summary"]
}

Response:
{
  "results": [
    {
      "content": "...",
      "content_type": "paper",
      "similarity_score": 0.92,
      "metadata": {}
    }
  ]
}
```

#### PDF Report Generation
```
POST /reports/group/{group_id}/generate

Request:
{
  "title": "Research Summary",
  "date_range": "2024-01-01 to 2024-12-31"
}

Response (binary PDF file)
```

#### Health Check
```
GET /health

Response:
{
  "status": "healthy",
  "service": "openresearch-ai",
  "groq_configured": true,
  "database_connected": true,
  "embeddings_available": true,
  "version": "1.0.0"
}
```

## 🔗 Integration with Node.js Server

The Node.js server (`server/`) proxies AI requests through `/api/ai/*` endpoints. AI responses are sent back to clients via Socket.IO for real-time delivery.

### Proxy Pattern

```typescript
// In server/src/routes/ai.ts
router.post('/groups/:groupId/chat', async (req, res) => {
  const response = await fetch('http://localhost:8000/groups/{group_id}/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: req.body.prompt,
      session_id: req.body.sessionId,
    }),
  });
  const data = await response.json();
  res.json(data);
});
```

### Client Endpoints (via Node.js proxy)

**HTTP REST:**
- `POST /api/ai/groups/:groupId/chat` - Proxied to AI service `/groups/{group_id}/ai-chat`
- `POST /api/ai/papers/question` - Proxied to AI service `/papers/question`
- `POST /api/ai/papers/summarize` - Proxied to AI service `/papers/summarize`
- `POST /api/ai/vectors/search` - Proxied to AI service `/vectors/search`
- `POST /api/ai/reports/group/:groupId/generate` - Proxied to AI service `/reports/group/{group_id}/generate`
- `GET /api/ai/health` - Proxied to AI service `/health`

**Socket.IO (Real-time):**
Clients emit Socket.IO events which trigger AI service calls:
- `paper:question` → Calls AI `/papers/question`
- `paper:summarize` → Calls AI `/papers/summarize`
- `message:send` (with @ai) → Calls AI `/groups/{group_id}/ai-chat`

Responses are sent back to clients via Socket.IO events.

### Environment Configuration

**AI Service must know about the database and use the same DATABASE_URL as the Node.js server** to fetch group context:

```env
# Both ai-service and server must use same DATABASE_URL
DATABASE_URL=postgresql://postgres:password@localhost:5432/openresearch

# Server proxies to AI service via localhost
# In docker-compose, service name is 'ai-service'
AI_SERVICE_URL=http://localhost:8000  # local dev
# or
AI_SERVICE_URL=http://ai-service:8000  # docker compose
```

## 📁 Project Structure

```
ai-service/
├── app/
│   ├── main.py             # FastAPI app with all endpoints
│   ├── config.py           # Settings & environment variables
│   ├── database.py         # Async SQLAlchemy connection (PostgreSQL + pgvector)
│   ├── groq_client.py      # Groq SDK wrapper for LLM calls
│   ├── embeddings.py       # OpenAI embeddings service (1536-dim)
│   ├── vector_store.py     # pgvector operations (search, insert, update)
│   ├── report_generator.py # PDF generation with ReportLab
│   └── models.py           # Pydantic request/response models
├── requirements.txt        # Python dependencies
├── pytest.ini              # Pytest configuration
├── run.sh                  # Development startup script
├── Dockerfile              # Docker containerization
├── .env.example            # Environment variables template
└── README.md               # This file

tests/
├── test_main.py            # API endpoint tests
├── test_embeddings.py      # Embedding generation tests
├── test_vector_store.py    # pgvector and search operation tests
├── test_report_generator.py # PDF generation tests
└── __init__.py
```

## 📚 Dependencies

**Production:**
- `fastapi` 0.104+ - Modern async web framework
- `uvicorn[standard]` 0.24+ - ASGI application server
- `groq` - Groq SDK for LLM inference (Llama 3.3)
- `sentence-transformers` - Local embeddings (SPECTER2/SPECTER)
- `torch` - Model runtime (CPU wheels supported)
- `transformers` - Model loading utilities
- `peft` - Required for SPECTER2 adapters
- `sqlalchemy[asyncio]` 2.0+ - Async ORM for database
- `asyncpg` 0.29+ - PostgreSQL async driver
- `psycopg2-binary` - PostgreSQL interface
- `pydantic` 2.0+ - Data validation and settings
- `pydantic-settings` - Environment variable management
- `tenacity` - Retry logic for API calls
- `httpx` - Async HTTP client
- `reportlab` 4.0+ - PDF generation

**Development & Testing:**
- `pytest` 7.4+ - Testing framework
- `pytest-asyncio` - Async test support
- `pytest-cov` - Coverage reporting
- `python-dotenv` - Environment file loading

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | **Yes** | - | Groq API key from console |
| `OPENAI_API_KEY` | **Yes** | - | OpenAI API key for embeddings |
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string (same as server) |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq model ID to use |
| `EMBEDDING_MODEL` | No | `text-embedding-3-small` | OpenAI embedding model |
| `EMBEDDING_DIMENSIONS` | No | `1536` | Embedding vector dimensions |
| `DEBUG` | No | `false` | Enable debug logging |
| `MAX_CONTEXT_MESSAGES` | No | `50` | Max messages to include in context |
| `MAX_CONTEXT_TOKENS` | No | `8000` | Max tokens for context window |
| `REQUEST_TIMEOUT` | No | `30` | API request timeout (seconds) |
| `LOG_LEVEL` | No | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR)

## 🚀 Production Deployment

### Docker Deployment

```bash
# Build image
docker build -t openresearch-ai:latest .

# Run container
docker run -p 8000:8000 \
  -e GROQ_API_KEY="your-key" \
  -e OPENAI_API_KEY="your-key" \
  -e DATABASE_URL="postgresql://..." \
  openresearch-ai:latest
```

### Uvicorn Production Setup

```bash
# Activate virtual environment
source venv/bin/activate

# Install production dependencies
pip install -r requirements.txt

# Start production server with multiple workers
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --timeout-keep-alive 5
```

### Environment Setup

Ensure all required environment variables are set:

```bash
export GROQ_API_KEY=your-production-key
export OPENAI_API_KEY=your-production-key
export DATABASE_URL=postgresql://user:pass@host:5432/openresearch
export GROQ_MODEL=llama-3.3-70b-versatile
export EMBEDDING_MODEL=text-embedding-3-small
export EMBEDDING_DIMENSIONS=1536
export DEBUG=false
```

### Recommended Hosting

**Platforms:**
- Railway
- Render
- Google Cloud Run
- AWS ECS / Lambda
- DigitalOcean App Platform

**Requirements:**
- Python 3.12+
- 512MB memory minimum, 1GB+ recommended
- Persistent connection to PostgreSQL
- Internet access for Groq and OpenAI APIs

### Health Checks

Configure your platform's health check to use:

```
GET /health
```

Expected response (200 OK):
```json
{
  "status": "healthy",
  "service": "openresearch-ai",
  "groq_configured": true,
  "database_connected": true,
  "embeddings_available": true,
  "version": "1.0.0"
}
```

### Performance Tuning

**For high-throughput:**
- Increase worker count: `--workers 8` (2-4x CPU cores)
- Adjust connection pool: Set in database config
- Enable caching for embeddings results
- Use pgvector HNSW index for fast similarity search

**For cost optimization:**
- Use batch operations for embeddings
- Cache frequently accessed embeddings
- Implement request rate limiting
- Monitor Groq and OpenAI API usage

## 🧪 Testing

All code must maintain ≥90% test coverage using pytest. See [Testing Guide](../docs/testing.md) for comprehensive testing documentation.

```bash
# Activate virtual environment
source venv/bin/activate

# Run all tests
pytest

# Run with coverage report
pytest --cov=app --cov-report=term-missing

# Run with coverage threshold check
pytest --cov=app --cov-report=term-missing --cov-fail-under=90

# Run specific test file
pytest tests/test_main.py

# Run specific test
pytest tests/test_main.py::test_health_check

# Run tests matching pattern
pytest -k "embedding"

# Verbose output
pytest -v

# Show print statements
pytest -s
```

### Test Files

- `test_main.py` - API endpoint tests (health, chat, summarize, etc.)
- `test_embeddings.py` - Embedding generation and OpenAI API tests
- `test_vector_store.py` - pgvector operations (search, insert, update)
- `test_report_generator.py` - PDF report generation tests

### Coverage Requirements

- **Lines**: ≥90%
- **Branches**: ≥90%
- **Statements**: ≥90%

## 📄 License

MIT License - See root LICENSE file for details.
