# OpenResearch

**Collaboration-First Research Platform**

A clean, focused platform for research teams to collaborate in real-time. Built for meaningful collaboration—no bloat, just what works.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-purple)

## ✨ Features

### Collaboration (Core)
- **Research Groups** — Create teams, invite members by email
- **Real-time Chat** — Live discussions with typing indicators
- **Discussion Sessions** — Organized conversations per topic
- **Member Management** — Invite collaborators, manage roles

### Research Tools
- **Paper Discovery** — Search Semantic Scholar & arXiv
- **Paper Library** — Save and organize papers you find
- **Session Context** — Papers linked to discussions

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Next.js App    │────▶│  Node.js API    │────▶│  PostgreSQL     │
│  (Frontend)     │     │  (Backend)      │     │  (Database)     │
│                 │◀────│  + Socket.IO    │     │                 │
│  + Socket.IO    │     │                 │     │                 │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Key Technologies:**
- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS, Socket.IO Client, Zustand
- **Backend:** Node.js, Express, Socket.IO, Drizzle ORM
- **Database:** PostgreSQL (via Neon or Docker)
- **Real-time:** Socket.IO for bidirectional communication

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL (or use Docker)
- Docker & Docker Compose (recommended)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/BRUH-MAIN/OpenResearch.git
cd OpenResearch

# Copy environment file
cp .env.example .env

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

#### 3. Frontend

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
│   │   ├── auth/          # Sign in/up pages
│   │   ├── landing/       # Landing page
│   │   ├── home/          # Groups dashboard
│   │   ├── chat/          # Real-time chat sessions
│   │   ├── paper/         # Paper search & management
│   │   ├── profile/       # User profile
│   │   └── group/         # Group management
│   ├── components/        # React components
│   │   ├── layout/        # Navbar, Sidebar
│   │   ├── providers/     # Auth provider
│   │   └── ui/            # Reusable UI components
│   └── lib/               # Utilities, API client, stores
│       ├── api.ts         # API client & types
│       ├── auth.ts        # Auth store (Zustand)
│       ├── socket.ts      # Socket.IO hook
│       └── toast.ts       # Toast notifications
│
├── server/                 # Node.js Backend
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   │   ├── auth.ts    # Authentication (JWT)
│   │   │   ├── groups.ts  # Group management
│   │   │   ├── sessions.ts # Chat sessions
│   │   │   └── papers.ts  # Papers & external search
│   │   ├── middleware/    # Auth, error handling
│   │   ├── socket/        # Socket.IO handlers
│   │   ├── db/            # Drizzle ORM schema
│   │   ├── index.ts       # Server entry point
│   │   └── seed.ts        # Database seeder
│   └── drizzle.config.ts
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
| `JWT_SECRET` | JWT signing secret |

#### Server `.env`
| Variable | Description | Example |
|----------|-------------|---------||
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | JWT signing secret | `your-secret-key-here` |
| `PORT` | Server port (optional) | `3001` |

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
| `/api/papers/search/external` | GET | Search Semantic Scholar/arXiv |
| `/api/papers/import` | POST | Import external paper |
| `/api/papers/:id` | GET | Get paper details |
| `/api/papers/:id/save` | POST | Save paper |
| `/api/papers/:id/save` | DELETE | Unsave paper |
| `/api/papers/meta/tags` | GET | Get all tags |

#### AI Service (FastAPI - Port 8000)
| Endpoint | Method | Description |
|----------|--------|-----------|
| `/health` | GET | Check AI service health |
| `/chat` | POST | Chat Q&A with session context |
| `/summarize` | POST | Generate session summary |
| `/test` | POST | Test AI without context |

> The AI service runs as a separate FastAPI container. See `ai-service/README.md` for details.

### Socket.IO Events

#### Client → Server
- `message:send` - Send a message
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `session:join` - Join a session room
- `session:leave` - Leave a session room

#### Server → Client
- `message:new` - New message received
- `user:typing` - User is typing
- `user:stop-typing` - User stopped typing
- `error` - Error occurred

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
