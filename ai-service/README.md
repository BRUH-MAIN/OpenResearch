# OpenResearch AI Service

A minimal async FastAPI service providing AI-powered features for the OpenResearch platform.

## Features

- **Chat Q&A** - Ask questions with session context (messages + linked papers)
- **Session Summarization** - Generate summaries with key points
- **Health Checks** - Monitor service and dependency status

## Quick Start

### 1. Install Dependencies

```bash
cd ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and DATABASE_URL
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

# Test AI generation (no context needed)
curl -X POST "http://localhost:8000/test?question=What%20is%20AI"

# Chat Q&A with session context
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What have we discussed?", "session_id": "your-session-id"}'

# Session summary
curl -X POST http://localhost:8000/summarize \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-id"}'
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| POST | `/chat` | Chat Q&A with session context |
| POST | `/summarize` | Generate session summary |
| POST | `/test` | Test AI without context |

## Docker

```bash
# Build image
docker build -t openresearch-ai-service .

# Run container
docker run -p 8000:8000 \
  -e GEMINI_API_KEY=your-key \
  -e DATABASE_URL=postgresql://... \
  openresearch-ai-service
```

## Integration with Node.js Server

The Node.js server can call this service:

```typescript
// In your Node.js server
const response = await fetch('http://ai-service:8000/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: userQuestion,
    session_id: sessionId,
  }),
});

const { answer, sources, latency_ms } = await response.json();
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Model to use |
| `DATABASE_URL` | No | - | PostgreSQL connection string |
| `DEBUG` | No | `false` | Enable debug logging |
