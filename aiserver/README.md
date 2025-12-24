# OpenResearch AI Server

AI-powered backend for the OpenResearch platform, built with FastAPI and Google Gemini.

## Features

- **Session Summarization**: Generate concise summaries of research discussions
- **Task Extraction**: Automatically identify action items and to-dos from conversations
- **Q&A**: Answer questions based on session context

## Tech Stack

- **FastAPI**: Modern, fast Python web framework
- **Google Gemini**: AI model (gemini-1.5-flash) for natural language processing
- **Pydantic**: Data validation and serialization
- **Uvicorn**: ASGI server

## Setup

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy the key

### 2. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your API key
GEMINI_API_KEY=your_api_key_here
```

### 3. Install Dependencies

Using [uv](https://github.com/astral-sh/uv) (recommended):

```bash
# Install uv if you haven't
curl -LsSf https://astral.sh/uv/install.sh | sh

# Sync dependencies
uv sync
```

Or using pip:

```bash
pip install -e .
```

### 4. Run the Server

Using uv:

```bash
uv run python main.py
```

Or directly:

```bash
python main.py
```

The server will start at `http://localhost:8000`

## API Endpoints

### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "gemini_configured": true
}
```

### Summarize Session
```http
POST /api/summarize
Content-Type: application/json

{
  "session_title": "Research Discussion",
  "messages": [
    {
      "id": "1",
      "content": "Let's discuss the methodology",
      "user_name": "Alice",
      "type": "user",
      "created_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

Response:
```json
{
  "summary": "A discussion about research methodology...",
  "key_points": ["Point 1", "Point 2"],
  "participant_count": 1
}
```

### Extract Tasks
```http
POST /api/extract-tasks
Content-Type: application/json

{
  "session_title": "Project Planning",
  "messages": [...]
}
```

Response:
```json
{
  "tasks": [
    {
      "title": "Review literature",
      "description": "Review papers from 2023",
      "assignee": "Bob",
      "priority": "high"
    }
  ]
}
```

### Ask Question
```http
POST /api/ask
Content-Type: application/json

{
  "question": "What was the main conclusion?",
  "session_title": "Research Discussion",
  "messages": [...]
}
```

Response:
```json
{
  "answer": "The main conclusion was...",
  "sources": ["msg-id-1", "msg-id-3"]
}
```

## API Documentation

FastAPI provides interactive documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Integration

The AI server is designed to work with the OpenResearch Node.js backend. The backend proxies requests to this AI server for AI-powered features in the chat interface.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google AI Studio API key | Yes |
| `PORT` | Server port (default: 8000) | No |
| `HOST` | Server host (default: 0.0.0.0) | No |