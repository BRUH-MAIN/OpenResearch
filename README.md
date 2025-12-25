# OpenResearch

**AI-Native Collaborative Research Platform**

A modern platform for research groups to collaborate, discuss papers, and leverage AI for insights.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![Python](https://img.shields.io/badge/Python-3.12-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Google Gemini](https://img.shields.io/badge/AI-Gemini-orange)

## ✨ Features

### Core Features
- **Research Groups**: Create and manage collaborative research groups
- **Real-time Chat**: Live discussions with Socket.IO
- **Paper Management**: Search, save, and organize academic papers
- **External Paper Search**: Search Semantic Scholar and arXiv directly

### AI-Powered Features
- **Session Summarization**: Get AI-generated summaries of discussions
- **Task Extraction**: Automatically identify action items from conversations
- **Contextual Q&A**: Ask questions about your research sessions

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Next.js App    │────▶│  Node.js API    │────▶│  PostgreSQL     │
│  (Frontend)     │     │  (Backend)      │     │  (Database)     │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │                 │
                        │  Python AI      │──── Google Gemini
                        │  (FastAPI)      │
                        │                 │
                        └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Python 3.12+
- PostgreSQL (or use Docker)
- [uv](https://github.com/astral-sh/uv) (for Python AI server)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/BRUH-MAIN/OpenResearch.git
cd OpenResearch

# Copy environment file
cp .env.example .env

# Edit .env and add your GEMINI_API_KEY
# Get one at: https://aistudio.google.com/app/apikey

# Start all services
docker-compose up -d

# Access the app
open http://localhost:3000
```

### Option 2: Manual Setup

#### 1. Database Setup

```bash
# Using Docker for PostgreSQL
docker run --name openresearch-db \
  -e POSTGRES_USER=openresearch \
  -e POSTGRES_PASSWORD=openresearch \
  -e POSTGRES_DB=openresearch \
  -p 5432:5432 \
  -d postgres:16-alpine
```

#### 2. Backend Server

```bash
cd server

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your database URL

# Run migrations and seed data
npm run db:push
npm run db:seed

# Start development server
npm run dev
```

#### 3. AI Server

```bash
cd aiserver

# Copy environment file
cp .env.example .env
# Add your GEMINI_API_KEY

# Install dependencies and run
uv sync
uv run python main.py
```

#### 4. Frontend

```bash
cd client

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

## 📁 Project Structure

```
OpenResearch/
├── client/                 # Next.js 14 Frontend
│   ├── app/               # App router pages
│   ├── components/        # React components
│   └── lib/               # Utilities, API client, stores
│
├── server/                 # Node.js Backend
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Auth, error handling
│   │   ├── socket/        # Socket.IO handlers
│   │   └── db/            # Drizzle ORM schema
│   └── drizzle.config.ts
│
├── aiserver/              # Python AI Server
│   ├── main.py            # FastAPI app
│   └── pyproject.toml
│
└── docker-compose.yml     # Docker orchestration
```

## 🔧 Configuration

### Environment Variables

#### Root `.env` (for Docker)
| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `JWT_SECRET` | JWT signing secret |

#### Server `.env`
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `AI_SERVER_URL` | Python AI server URL |

#### AI Server `.env`
| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI Studio API key |

## 📚 API Documentation

### Backend API (Port 3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/groups` | GET/POST | List/create groups |
| `/api/sessions` | GET/POST | List/create sessions |
| `/api/papers` | GET | List papers |
| `/api/papers/search/external` | GET | Search Semantic Scholar/arXiv |
| `/api/ai/summarize/:sessionId` | POST | Summarize session |
| `/api/ai/extract-tasks/:sessionId` | POST | Extract tasks |
| `/api/ai/ask/:sessionId` | POST | Q&A with context |

### AI Server API (Port 8000)

Interactive docs available at `http://localhost:8000/docs`

## 🧪 Testing

```bash
# Backend tests
cd server
npm test

# Frontend tests
cd client
npm test
```

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild after changes
docker-compose up -d --build

# Reset database
docker-compose down -v
docker-compose up -d
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

Built with ❤️ for researchers
