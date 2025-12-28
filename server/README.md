# OpenResearch Server

## 🚀 Backend API with Real-time Features

Express.js backend for OpenResearch with:
- **JWT Authentication** - Secure user authentication with access & refresh tokens
- **PostgreSQL Database** - Drizzle ORM for type-safe database operations
- **Real-time Messaging** - Socket.IO for live chat and notifications
- **External Paper Search** - Semantic Scholar and arXiv integration
- **RESTful API** - Complete CRUD operations for all resources

## 📁 Project Structure

```
server/
├── src/
│   ├── db/
│   │   ├── index.ts      # Database connection
│   │   └── schema.ts     # Drizzle schema definitions
│   ├── middleware/
│   │   ├── auth.ts       # JWT authentication middleware
│   │   └── error.ts      # Error handling middleware
│   ├── routes/
│   │   ├── auth.ts       # Authentication routes
│   │   ├── groups.ts     # Groups CRUD
│   │   ├── sessions.ts   # Sessions & messages
│   │   └── papers.ts     # Papers & saved papers
│   ├── socket/
│   │   └── index.ts      # Socket.IO setup
│   ├── index.ts          # Main entry point
│   └── seed.ts           # Database seeder
├── drizzle.config.ts     # Drizzle Kit config
├── tsconfig.json
└── package.json
```

## 🛠️ Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string (Neon or local)
- `JWT_SECRET` - Secret key for JWT tokens (use a strong random string)
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens (different from JWT_SECRET)
- `AI_SERVICE_URL` - URL of the FastAPI AI service (default: http://ai-service:8000)
- `PORT` - Server port (default: 3001)
- `CLIENT_URL` - Frontend URL for CORS (default: http://localhost:3000)

### 2. Database Setup

```bash
# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### 3. Run Development Server

```bash
npm run dev
```

Server runs at `http://localhost:3001`

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/me` | Update current user |

### Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | Get user's groups |
| GET | `/api/groups/:id` | Get single group |
| POST | `/api/groups` | Create group |
| PATCH | `/api/groups/:id` | Update group |
| DELETE | `/api/groups/:id` | Delete group |
| GET | `/api/groups/:id/members` | Get group members |
| POST | `/api/groups/:id/members` | Add member |
| DELETE | `/api/groups/:id/members/:userId` | Remove member |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/group/:groupId` | Get group sessions |
| GET | `/api/sessions/:id` | Get single session |
| POST | `/api/sessions` | Create session |
| PATCH | `/api/sessions/:id` | Update session |
| DELETE | `/api/sessions/:id` | Delete session |
| GET | `/api/sessions/:id/messages` | Get messages |
| GET | `/api/sessions/:id/tasks` | Get tasks |
| POST | `/api/sessions/:id/tasks` | Create task |
| PATCH | `/api/sessions/:id/tasks/:taskId` | Update task |

### Papers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/papers` | Get all papers |
| GET | `/api/papers/saved` | Get saved papers |
| GET | `/api/papers/:id` | Get single paper |
| POST | `/api/papers` | Create paper |
| POST | `/api/papers/:id/save` | Save paper |
| PATCH | `/api/papers/:id/save` | Update notes |
| DELETE | `/api/papers/:id/save` | Unsave paper |
| GET | `/api/papers/meta/tags` | Get all tags |

### AI Features

AI features are provided by a separate FastAPI service (`ai-service/`).
The Node.js server proxies requests or the client can call it directly.

See `ai-service/README.md` for:
- Chat Q&A with session context
- Session summarization
- Health checks

## 📡 Socket.IO Events
| Event | Payload | Description |
|-------|---------|-------------|
| `join:session` | `sessionId` | Join a chat session |
| `leave:session` | `sessionId` | Leave a session |
| `message:send` | `{ sessionId, content }` | Send a message |
| `typing:start` | `sessionId` | Start typing indicator |
| `typing:stop` | `sessionId` | Stop typing indicator |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `joined:session` | `{ sessionId }` | Confirmed joined |
| `message:new` | `Message` | New message received |
| `user:joined` | `{ userId, userName }` | User joined session |
| `user:left` | `{ userId, userName }` | User left session |
| `user:typing` | `{ userId, userName }` | User is typing |
| `user:stopped-typing` | `{ userId }` | User stopped typing |
| `error` | `{ message }` | Error occurred |

## 🗄️ Database Schema

### Tables
- `users` - User accounts
- `groups` - Research groups
- `group_members` - Group membership (junction)
- `sessions` - Chat sessions
- `messages` - Session messages
- `papers` - Research papers
- `saved_papers` - User's saved papers (junction)
- `tasks` - Session tasks
- `refresh_tokens` - JWT refresh tokens

## 🧪 Test Credentials

After running `npm run db:seed`:

```
Email: alice@example.com
Password: password123
```
