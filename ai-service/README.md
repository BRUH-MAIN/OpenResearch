# OpenResearch AI Service

FastAPI service providing AI-powered features for the OpenResearch platform using Groq (Llama 3.3) for chat and OpenAI for embeddings.

## 🎯 Features

- **Chat Q&A** - Answer questions with session context (messages + linked papers)
- **Session Summarization** - Generate discussion summaries with key points
- **Contextual AI** - Fetch session messages and papers from PostgreSQL
- **Health Checks** - Monitor service and dependency status
- **Async Operations** - Non-blocking I/O with asyncio and SQLAlchemy

## 🏗️ Architecture

```
┌─────────────┐
│  FastAPI    │ ← HTTP requests from Node.js server
│  (Port 8000)│
└──────┬──────┘
       │
       ├─────▶ Groq API (Llama 3.3 70B)
       │
       ├─────▶ OpenAI API (Embeddings)
       │
       └─────▶ PostgreSQL (async SQLAlchemy)
               - Fetch session messages
               - Fetch linked papers
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd ai-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Required variables:
- `GROQ_API_KEY` - Get from [Groq Console](https://console.groq.com/keys)
- `DATABASE_URL` - PostgreSQL connection string (same as server)
- `GROQ_MODEL` - Default: `llama-3.3-70b-versatile`
- `DEBUG` - Set to `true` for verbose logging

Example `.env`:
```env
GROQ_API_KEY=your-groq-api-key-here
DATABASE_URL=postgresql://postgres:password@localhost:5432/openresearch
GROQ_MODEL=llama-3.3-70b-versatile
DEBUG=false
```

### 3. Run the Service

```bash
# Development mode with auto-reload
uvicorn app.main:app --reload --port 8000

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 4. Test the API

```bash
# Health check
curl http://localhost:8000/health

# Test AI generation (no database context)
curl -X POST "http://localhost:8000/test" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is AI?"}'

# Chat Q&A with session context
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What have we discussed about neural networks?",
    "session_id": "your-session-uuid"
  }'

# Generate session summary
curl -X POST "http://localhost:8000/summarize" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-uuid"}'
```

## 📚 API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs (Interactive API docs)
- **ReDoc**: http://localhost:8000/redoc (Alternative documentation)
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## 📡 Endpoints

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/health` | Service health check | None |
| POST | `/test` | Test AI without context | `{"question": "..."}` |
| POST | `/chat` | Chat with session context | `{"question": "...", "session_id": "uuid"}` |
| POST | `/summarize` | Generate session summary | `{"session_id": "uuid"}` |

### Request/Response Examples

#### Chat Endpoint
```json
// Request
POST /chat
{
  "question": "What did we discuss about transformers?",
  "session_id": "123e4567-e89b-12d3-a456-426614174000"
}

// Response
{
  "answer": "Based on your discussion, you covered...",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "context_used": {
    "messages": 15,
    "papers": 2
  }
}
```

#### Summarize Endpoint
```json
// Request
POST /summarize
{
  "session_id": "123e4567-e89b-12d3-a456-426614174000"
}

// Response
{
  "summary": "## Session Summary\n\n**Key Topics Discussed:**\n- ...",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "message_count": 15,
  "paper_count": 2
}
```

## 🔗 Integration with Node.js Server

The Node.js server (`server/`) proxies AI requests through `/api/ai/*` endpoints:

```typescript
// In server/src/routes/ai.ts
router.post('/chat', async (req, res) => {
  const response = await fetch('http://localhost:8000/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: req.body.question,
      session_id: req.body.sessionId,
    }),
  });
  const data = await response.json();
  res.json(data);
});
```

Clients call proxied endpoints:
- `POST /api/ai/chat` - Proxied to AI service `/chat`
- `POST /api/ai/summarize` - Proxied to AI service `/summarize`  
- `POST /api/ai/test` - Proxied to AI service `/test`

## 📁 Project Structure

```
ai-service/
├── app/
│   ├── main.py           # FastAPI app & endpoints
│   ├── config.py         # Settings & environment vars
│   ├── database.py       # Async SQLAlchemy connection
│   ├── groq_client.py    # Groq SDK wrapper
│   ├── embeddings.py     # OpenAI embeddings service
│   └── models.py         # Pydantic request/response models
├── requirements.txt      # Python dependencies
├── .env.example         # Environment template
└── README.md            # This file
```

## 📚 Dependencies

- `fastapi` - Modern async web framework
- `uvicorn[standard]` - ASGI server
- `groq` - Groq SDK for LLM inference
- `openai` - OpenAI SDK for embeddings
- `sqlalchemy[asyncio]` - Async ORM
- `asyncpg` - PostgreSQL async driver
- `pydantic` - Data validation & settings
- `tenacity` - Retry logic for API calls
- `httpx` - Async HTTP client

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | - | Groq API key |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Model to use |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `DEBUG` | No | `false` | Enable debug logging |
| `MAX_CONTEXT_MESSAGES` | No | `50` | Max messages to include |
| `MAX_CONTEXT_TOKENS` | No | `8000` | Max tokens for context |
| `REQUEST_TIMEOUT` | No | `30` | API request timeout (seconds) |

## 🚀 Production Deployment

### Run with Uvicorn

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start production server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Environment Setup

Set production environment variables:
```bash
export GROQ_API_KEY=your-production-key
export DATABASE_URL=postgresql://user:pass@host:5432/db
export GROQ_MODEL=llama-3.3-70b-versatile
export DEBUG=false
```

### Recommended Hosting
- **Platform**: Railway, Render, Google Cloud Run, AWS ECS
- **Python**: 3.12+
- **Memory**: 512MB minimum, 1GB recommended
- **Reverse Proxy**: Not required (FastAPI handles HTTPS)

### Health Checks

Configure health check endpoint: `GET /health`

Expected response:
```json
{
  "status": "healthy",
  "service": "openresearch-ai",
  "groq_configured": true,
  "database_connected": true
}
```

## 🧪 Testing

```bash
# Run tests (when added)
python -m pytest

# With coverage
python -m pytest --cov=app
```

## 📄 License

MIT License - See root LICENSE file for details.
