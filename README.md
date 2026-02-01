# OpenResearch

**Collaboration-First Research Platform**

A clean, focused platform for research teams to collaborate in real-time with AI-powered features. Built for meaningful collaboration—no bloat, just what works.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![pgvector](https://img.shields.io/badge/pgvector-RAG-orange)
![Python](https://img.shields.io/badge/Python-3.12-yellow)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-purple)
![Coverage](https://img.shields.io/badge/coverage-≥90%25-brightgreen)

## ✨ Features

### Collaboration (Core)
- **Research Groups** — Create teams, invite members by email
- **Real-time Chat** — Live discussions with typing indicators
- **Discussion Sessions** — Organized conversations per topic
- **Member Management** — Invite collaborators, manage roles

### AI-Powered Research (NEW)
- **Group AI Chat** — Ask `@ai` questions with group-isolated RAG context
- **Paper Q&A** — Ask questions about papers in your group: `@ai What's the methodology?`
- **Paper Summarization** — Generate AI summaries with key points extraction
- **Paper Discovery** — AI-powered recommendations based on group context
- **Group Reports** — Generate PDF reports summarizing research activity

### Research Tools
- **Paper Discovery** — Search arXiv for academic papers
- **Paper Library** — Save and organize papers per group
- **Vector Search** — Semantic search across group papers (pgvector)
- **Session Context** — Papers linked to discussions
- **AI Trigger** — All AI features require `@ai` trigger for intentional activation

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│                 │     │                 │     │                     │
│  Next.js 16     │────▶│  Node.js 20     │────▶│  PostgreSQL 16      │
│  (Frontend)     │     │  Express API    │     │  + pgvector         │
│                 │◀────│  + Socket.IO    │     │  (Vector Storage)   │
│  + Socket.IO    │     │                 │     │                     │
│                 │     │        │        │     │  HNSW Index         │
└─────────────────┘     │        ▼        │     │  Cosine Similarity  │
                        │  ┌──────────┐   │     └─────────────────────┘
                        │  │ FastAPI  │   │
                        │  │ AI + RAG │   │
                        │  │ Embeddings│  │
                        │  └──────────┘   │
                        └─────────────────┘
```

**Key Technologies:**
- **Frontend:** Next.js 16, React 19, TypeScript, TailwindCSS 4, Socket.IO Client, Zustand
- **Backend:** Node.js 20, Express 5, Socket.IO 4.8, Drizzle ORM, JWT Auth
- **Database:** PostgreSQL 16 + **pgvector** for vector storage (1536-dim embeddings)
- **AI Service:** Python 3.12, FastAPI, Groq (Llama 3.3 70B), OpenAI Embeddings, ReportLab (PDF)
- **Real-time:** Socket.IO for bidirectional communication
- **Vector Index:** HNSW with cosine similarity for fast semantic search

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.12+
- PostgreSQL 16+

### Setup Steps

#### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/openresearch.git
cd openresearch
```

#### 2. Database Setup

```bash
# Create PostgreSQL database
createdb openresearch

# Or use Neon serverless: https://neon.tech
# Get your connection string from the Neon dashboard
```

#### 3. Backend Server

```bash
cd server

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
nano .env  # Edit DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

# Initialize database
npm run db:push
npm run db:seed

# Start development server
npm run dev
# Server runs at http://localhost:3001
```

#### 4. Frontend Client

```bash
cd client

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env.local
nano .env.local  # Edit NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL

# Start development server
npm run dev
# Client runs at http://localhost:3000
```

#### 5. AI Service

```bash
cd ai-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
nano .env  # Set GROQ_API_KEY and DATABASE_URL

# Start service
uvicorn app.main:app --reload --port 8000
# AI service runs at http://localhost:8000
```

### Access the Application

- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001
- **AI Service:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

### Test Credentials

After running `npm run db:seed`:
```
Email: alice@example.com
Password: password123
```

```

## 📁 Project Structure

```
OpenResearch/
├── client/                 # Next.js 16 Frontend
│   ├── app/               # App router pages
│   │   ├── auth/          # Sign in/up pages
│   │   ├── landing/       # Landing page
│   │   ├── home/          # Groups dashboard
│   │   ├── chat/          # Real-time chat sessions
│   │   ├── paper/         # Paper search & management
│   │   ├── profile/       # User profile
│   │   ├── group/         # Group management
│   │   ├── group-papers/  # Group papers with AI Q&A
│   │   ├── discover/      # Paper discovery & recommendations
│   │   ├── reports/       # Group reports (PDF generation)
│   │   └── invitations/   # Group invitations
│   ├── components/        # React components
│   │   ├── layout/        # Navbar
│   │   ├── providers/     # Auth & error providers
│   │   └── ui/            # Reusable UI (Button, Card, etc.)
│   └── lib/               # Utilities, API client, stores
│       ├── api.ts         # API client & types
│       ├── auth.ts        # Auth store (Zustand)
│       ├── socket.ts      # Socket.IO hook
│       └── toast.ts       # Toast notifications
│
├── server/                 # Node.js 20 Backend
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   │   ├── auth.ts    # Authentication (JWT)
│   │   │   ├── groups.ts  # Group management
│   │   │   ├── sessions.ts # Chat sessions
│   │   │   ├── papers.ts  # Papers & arXiv search
│   │   │   ├── ai.ts      # AI service proxy
│   │   │   ├── groupPapers.ts # Group papers & vectors
│   │   │   ├── reports.ts    # PDF report generation
│   │   │   ├── recommendations.ts # Paper discovery
│   │   │   └── health.ts  # Health checks
│   │   ├── middleware/    # Auth, error, rate limiting
│   │   ├── socket/        # Socket.IO handlers (paper Q&A, summarize)
│   │   ├── db/            # Drizzle ORM schema
│   │   ├── services/      # AI client
│   │   ├── utils/         # Logger, helpers
│   │   ├── validation/    # Zod schemas
│   │   ├── index.ts       # Server entry point
│   │   └── seed.ts        # Database seeder
│   ├── tests/             # Vitest tests (≥90% coverage)
│   │   ├── auth.test.ts
│   │   ├── groups.test.ts
│   │   ├── papers.test.ts
│   │   ├── groupPapers.test.ts
│   │   ├── reports.test.ts
│   │   ├── recommendations.test.ts
│   │   └── socket.test.ts
│   └── drizzle/           # Database migrations
│
├── ai-service/             # Python 3.12 FastAPI AI Service
│   ├── app/
│   │   ├── main.py        # FastAPI app with RAG endpoints
│   │   ├── config.py      # Settings
│   │   ├── database.py    # Async SQLAlchemy
│   │   ├── groq_client.py # Groq API integration (Llama 3.3)
│   │   ├── embeddings.py  # OpenAI embeddings (1536-dim)
│   │   ├── vector_store.py # pgvector operations
│   │   ├── report_generator.py # PDF generation (ReportLab)
│   │   └── models.py      # Pydantic models
│   ├── tests/             # pytest tests (≥90% coverage)
│   │   ├── test_main.py   # API endpoint tests
│   │   ├── test_embeddings.py # Embedding tests
│   │   ├── test_vector_store.py # Vector store tests
│   │   └── test_report_generator.py # Report tests
│   └── pytest.ini         # Pytest configuration
│
├── docs/                   # Documentation
│   └── features/
│       ├── group-context.md   # RAG & vector storage
│       └── ai-features.md     # AI feature guide
│
├── .github/workflows/     # CI/CD
│   └── ci.yml             # Tests & coverage (≥90%)
│
├── .env.example           # Environment template
└── README.md              # This file
```

## 🤖 AI Features & @ai Trigger

All AI features require the `@ai` trigger to activate. This ensures intentional AI usage.

### Usage Examples

```bash
# Group Chat
"@ai What papers discuss transformer architectures?"
"@ai Summarize our recent findings"

# Paper Q&A
"@ai What methodology was used in this paper?"
"@ai What are the limitations?"

# Paper Summarization (no @ai needed - explicit action)
Click "Summarize" button on any paper
```

### Why @ai Trigger?

1. **Intentional**: Prevents accidental AI calls
2. **Cost Control**: Only processes explicit requests
3. **Traceable**: Easy to audit AI usage
4. **Clear UX**: Users know when AI is responding

### Learn More
- [AI Features Documentation](docs/features/ai-features.md)
- [Group Context & RAG](docs/features/group-context.md)
- [Group Memory Notes](docs/features/group-memory-notes.md)
- [Database Schema](docs/database-schema.md)
- [Socket.IO Events](docs/socket-io-events.md)
- [Deployment Guide](docs/deployment.md)
- [Testing Guide](docs/testing.md)
```

## 🔧 Configuration

### Environment Variables

#### Server `.env`
| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes |
| `PORT` | Server port | No (default: 3001) |
| `CLIENT_URL` | Frontend URL for CORS | No (default: http://localhost:3000) |
| `NODE_ENV` | Environment (development/production) | No |

#### Client `.env.local`
| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | Yes |
| `NEXT_PUBLIC_WS_URL` | Socket.IO server URL | Yes |

#### AI Service `.env`
| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq API key | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `GROQ_MODEL` | Model to use | No (default: llama-3.3-70b-versatile) |
| `DEBUG` | Enable debug logging | No (default: false) |

## 🔧 Development

### Database Management

```bash
cd server

# Push schema changes to database
npm run db:push

# Generate migrations
npm run db:generate

# View database in Drizzle Studio
npm run db:studio

# Seed with sample data
npm run db:seed
```

### Running Tests

```bash
# Backend tests
cd server
npm test
npm run test:coverage

# Frontend tests (when added)
cd client
npm test
```

### Code Quality

```bash
# Frontend linting
cd client
npm run lint

# Backend (add linting in package.json if needed)
cd server
npm run lint
```

## 📚 API Documentation

### Backend API (Port 3001)

#### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/auth/logout` | POST | Logout user |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/me` | PATCH | Update user profile |

#### Groups
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/groups` | GET | List user's groups |
| `/api/groups` | POST | Create a group |
| `/api/groups/:id` | GET | Get group details |
| `/api/groups/:id` | PATCH | Update group |
| `/api/groups/:id` | DELETE | Delete group |
| `/api/groups/:id/members` | GET | List members |
| `/api/groups/:id/members` | POST | Add member |
| `/api/groups/:id/members/:userId` | DELETE | Remove member |

#### Sessions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions/group/:groupId` | GET | List group sessions |
| `/api/sessions` | POST | Create session |
| `/api/sessions/:id` | GET | Get session |
| `/api/sessions/:id` | PATCH | Update session |
| `/api/sessions/:id` | DELETE | Delete session |
| `/api/sessions/:id/messages` | GET | Get messages |
| `/api/sessions/:id/messages/:msgId` | DELETE | Delete message |

#### Papers
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/papers` | GET | List papers |
| `/api/papers/saved` | GET | Get saved papers |
| `/api/papers/search/external` | GET | Search arXiv |
| `/api/papers/import` | POST | Import external paper |
| `/api/papers/:id` | GET | Get paper details |
| `/api/papers/:id/save` | POST | Save paper |
| `/api/papers/:id/save` | DELETE | Unsave paper |
| `/api/papers/meta/tags` | GET | Get all tags |

#### Group Papers & AI (with @ai trigger)
| Endpoint | Method | Description |
|----------|--------|-----------|
| `/api/groups/:groupId/papers` | GET | List group papers |
| `/api/groups/:groupId/papers` | POST | Add paper to group |
| `/api/groups/:groupId/papers/:paperId/question` | POST | Ask question (@ai required) |
| `/api/groups/:groupId/papers/:paperId/summarize` | POST | Summarize paper (@ai trigger) |

#### Recommendations & Discovery
| Endpoint | Method | Description |
|----------|--------|-----------|
| `/api/recommendations/group/:groupId` | GET | AI-powered recommendations |
| `/api/recommendations/trending` | GET | Trending papers |

#### Reports
| Endpoint | Method | Description |
|----------|--------|-----------|
| `/api/reports/group/:groupId/generate` | POST | Generate PDF report |
| `/api/reports/group/:groupId` | GET | List group reports |
| `/api/reports/:reportId` | GET | Get report details |
| `/api/reports/:reportId/download` | GET | Download PDF |

#### AI Service (FastAPI - Port 8000)
| Endpoint | Method | Description |
|----------|--------|-----------|
| `/health` | GET | Service health check |
| `/groups/{group_id}/ai-chat` | POST | Group AI chat (RAG) |
| `/papers/question` | POST | Paper Q&A |
| `/papers/summarize` | POST | Paper summarization |
| `/vectors/search` | POST | Vector semantic search |
| `/vectors/group/{group_id}/embed` | POST | Create embeddings |
| `/reports/group/{group_id}/generate` | POST | Generate PDF report |
| `/chat` | POST | Legacy Q&A with session context |
| `/summarize` | POST | Generate session summary |

**Note**: AI endpoints are proxied through the Node.js server at `/api/ai/*`

> See individual service README files (`server/README.md`, `client/README.md`, `ai-service/README.md`) for detailed API documentation.

### Socket.IO Events

#### Client → Server
- `message:send` - Send a message (triggers @ai if present)
- `join:session` - Join a session room
- `leave:session` - Leave a session room
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `paper:question` - Ask paper question (@ai required)
- `paper:summarize` - Request paper summary

#### Server → Client
- `message:new` - New message received (includes AI responses)
- `user:joined` - User joined session
- `user:left` - User left session
- `user:typing` - User is typing
- `user:stopped-typing` - User stopped typing
- `paper:answer` - Paper Q&A response
- `paper:summary` - Paper summarization response
- `joined:session` - Confirmed session join
- `error` - Error occurred

## 🧪 Testing

All services must maintain ≥90% test coverage. CI will fail if coverage drops below threshold. See [Testing Guide](docs/testing.md) for comprehensive testing documentation.

```bash
# Backend tests (Vitest)
cd server
npm test                    # Run all tests
npm run test:coverage       # With coverage report
npm run test:watch         # Watch mode

# AI Service tests (pytest)
cd ai-service
source venv/bin/activate
pytest                      # Run all tests
pytest --cov=app --cov-report=term-missing --cov-fail-under=90

# Frontend (when tests are added)
cd client
npm test
```

### Coverage Thresholds

| Service | Tool | Lines | Functions | Branches | Statements |
|---------|------|-------|-----------|----------|------------|
| Server | Vitest | 90% | 90% | 90% | 90% |
| AI Service | pytest-cov | 90% | - | 90% | 90% |

### Test Files

**Server (`server/tests/`):**
- `auth.test.ts` - Authentication flow tests
- `groups.test.ts` - Group CRUD tests
- `papers.test.ts` - Paper management tests
- `groupPapers.test.ts` - Group papers + AI features
- `reports.test.ts` - PDF report generation
- `recommendations.test.ts` - Paper discovery
- `socket.test.ts` - Real-time socket handlers

**AI Service (`ai-service/tests/`):**
- `test_main.py` - FastAPI endpoint tests
- `test_embeddings.py` - Embedding generation tests
- `test_vector_store.py` - pgvector operations tests
- `test_report_generator.py` - PDF generation tests

## 🚀 Production Deployment

### Environment Setup

1. **Database**: Set up PostgreSQL 16+ (recommended: [Neon](https://neon.tech) for serverless)
2. **Environment Variables**: Set all required variables in production
3. **Secrets**: Generate strong JWT secrets (32+ characters)

### Backend Deployment

```bash
cd server
npm install --production
npm run build  # If TypeScript compilation needed
NODE_ENV=production node src/index.ts
```

### Frontend Deployment

```bash
cd client
npm install
npm run build
npm start
```

Or deploy to Vercel:
```bash
vercel deploy
```

### AI Service Deployment

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Recommended Hosting

- **Frontend**: Vercel, Netlify
- **Backend**: Railway, Render, AWS EC2
- **Database**: Neon, Supabase, AWS RDS
- **AI Service**: Railway, Render, Google Cloud Run

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
