# OpenResearch Server

Express.js backend for OpenResearch with JWT authentication, PostgreSQL, and real-time features.

## 🚀 Features

- **JWT Authentication** - Secure user authentication with access & refresh tokens
- **PostgreSQL Database** - Drizzle ORM for type-safe database operations  
- **Real-time Messaging** - Socket.IO for live chat and notifications
- **External Paper Search** - arXiv integration
- **AI Service Integration** - Proxy to FastAPI AI service
- **RESTful API** - Complete CRUD operations for all resources

##  Project Structure

```
server/
├── src/
│   ├── config/
│   │   └── env.ts        # Environment variable validation
│   ├── db/
│   │   ├── index.ts      # Database connection (Neon/PostgreSQL)
│   │   └── schema.ts     # Drizzle schema definitions
│   ├── middleware/
│   │   ├── auth.ts       # JWT authentication middleware
│   │   ├── error.ts      # Error handling middleware
│   │   ├── rateLimiter.ts # Rate limiting
│   │   └── validate.ts   # Zod validation middleware
│   ├── routes/
│   │   ├── auth.ts       # Authentication routes
│   │   ├── groups.ts     # Groups CRUD
│   │   ├── sessions.ts   # Sessions & messages
│   │   ├── papers.ts     # Papers & saved papers
│   │   ├── ai.ts         # AI service proxy
│   │   └── health.ts     # Health checks
│   ├── services/
│   │   └── aiClient.ts   # AI service HTTP client
│   ├── socket/
│   │   └── index.ts      # Socket.IO setup & handlers
│   ├── utils/
│   │   ├── logger.ts     # Pino logger
│   │   └── dbErrors.ts   # Database error handling
│   ├── validation/
│   │   └── schemas.ts    # Zod validation schemas
│   ├── index.ts          # Main entry point
│   └── seed.ts           # Database seeder
├── drizzle/              # SQL migrations
├── drizzle.config.ts     # Drizzle Kit config
├── tsconfig.json
└── package.json
```

## 🛠️ Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
nano .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string (Neon serverless or local PostgreSQL)
- `JWT_SECRET` - Secret key for JWT tokens (min 32 characters, use strong random string)
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens (min 32 characters, different from JWT_SECRET)
- `PORT` - Server port (default: 3001)
- `CLIENT_URL` - Frontend URL for CORS (default: http://localhost:3000)
- `NODE_ENV` - Environment mode (development/production)

Example `.env`:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/openresearch
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_REFRESH_SECRET=your-different-super-secret-refresh-key-minimum-32-characters
PORT=3001
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### 4. Run Development Server

```bash
npm run dev
```

Server runs at `http://localhost:3001`

## 📡 API Endpoints

See [Root README](../README.md#-api-documentation) for comprehensive API documentation.

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
| POST | `/api/groups/:id/members` | Add member to group |
| DELETE | `/api/groups/:id/members/:userId` | Remove member from group |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/group/:groupId` | Get group sessions |
| GET | `/api/sessions/:id` | Get single session |
| POST | `/api/sessions` | Create session |
| PATCH | `/api/sessions/:id` | Update session |
| DELETE | `/api/sessions/:id` | Delete session |
| GET | `/api/sessions/:id/messages` | Get session messages |
| DELETE | `/api/sessions/:id/messages/:msgId` | Delete message |

### Papers & Paper Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/papers` | List papers |
| GET | `/api/papers/saved` | Get saved papers |
| GET | `/api/papers/search/external` | Search arXiv (external) |
| POST | `/api/papers/import` | Import external paper |
| GET | `/api/papers/:id` | Get paper details |
| POST | `/api/papers/:id/save` | Save paper |
| DELETE | `/api/papers/:id/save` | Unsave paper |
| GET | `/api/papers/meta/tags` | Get all tags |

### Group Papers & AI Features (with @ai trigger)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups/:groupId/papers` | List group papers |
| POST | `/api/groups/:groupId/papers` | Add paper to group |
| POST | `/api/groups/:groupId/papers/:paperId/question` | Ask question about paper (@ai) |
| POST | `/api/groups/:groupId/papers/:paperId/summarize` | Summarize paper |

### Paper Discovery & Recommendations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recommendations/group/:groupId` | AI-powered recommendations |
| GET | `/api/recommendations/trending` | Trending papers |

### PDF Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reports/group/:groupId/generate` | Generate PDF report |
| GET | `/api/reports/group/:groupId` | List group reports |
| GET | `/api/reports/:reportId` | Get report details |
| GET | `/api/reports/:reportId/download` | Download PDF report |

### AI Service Integration
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat` | Chat with session context |
| POST | `/api/ai/summarize` | Generate session summary |
| POST | `/api/ai/test` | Test AI without context |
| GET | `/api/ai/health` | AI service health check |

**Note**: AI endpoints proxy requests to the FastAPI service running on port 8000. See `../ai-service/README.md` for details.

## 📡 Socket.IO Events

Real-time bidirectional communication. All connections require JWT authentication via `auth.token`. See [Socket.IO Events Documentation](../docs/socket-io-events.md) for comprehensive details.

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join:session` | `{ sessionId }` | Join a chat session |
| `leave:session` | `{ sessionId }` | Leave a session |
| `message:send` | `{ sessionId, content }` | Send a message (triggers @ai if present) |
| `typing:start` | `{ sessionId }` | Start typing indicator |
| `typing:stop` | `{ sessionId }` | Stop typing indicator |
| `paper:question` | `{ paperId, groupId, question, sessionId? }` | Ask paper question (@ai) |
| `paper:summarize` | `{ paperId }` | Request paper summary |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `Message` | New message received (includes AI responses) |
| `user:joined` | `{ userId, userName }` | User joined session |
| `user:left` | `{ userId, userName }` | User left session |
| `user:typing` | `{ userId, userName }` | User is typing |
| `user:stopped-typing` | `{ userId }` | User stopped typing |
| `paper:answer` | `{ answer, paperId, groupId }` | Paper Q&A response |
| `paper:summary` | `{ summary, keyPoints, paperId }` | Paper summarization response |
| `joined:session` | `{ sessionId }` | Confirmed session join |
| `error` | `{ message }` | Error occurred |

## 🗄️ Database Schema

See [Database Schema Documentation](../docs/database-schema.md) for comprehensive schema details including relationships and indexes.

### Core Tables
- `users` - User accounts with authentication
- `groups` - Research collaboration groups
- `group_members` - Group membership (junction table)
- `sessions` - Chat/discussion sessions within groups
- `messages` - Session messages with timestamps
- `papers` - Research papers metadata
- `saved_papers` - User's saved papers (junction table)
- `group_papers` - Papers linked to groups
- `group_paper_vectors` - Vector embeddings for papers (pgvector, 1536-dim)
- `refresh_tokens` - JWT refresh tokens
- `group_memory_notes` - Group-scoped memory notes (embeddable)
- `ai_artifacts` - Generated artifacts (summaries, reports)
- `group_reports` - PDF reports (group-specific)

### Vector Storage
- **Table**: `group_paper_vectors`
- **Embedding**: 1536-dimensional OpenAI embeddings
- **Index Type**: HNSW (Hierarchical Navigable Small World)
- **Distance Metric**: Cosine similarity
- **Group Isolation**: Each group has isolated vector space

## 🧪 Testing

All code must maintain ≥90% test coverage using Vitest. See [Testing Guide](../docs/testing.md) for comprehensive testing documentation.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Files (`tests/`)
- `auth.test.ts` - Authentication and JWT token tests
- `groups.test.ts` - Group CRUD and membership tests
- `papers.test.ts` - Paper management and arXiv search tests
- `groupPapers.test.ts` - Group papers and AI vector features
- `reports.test.ts` - PDF report generation tests
- `recommendations.test.ts` - Paper recommendations and discovery
- `socket.test.ts` - Real-time Socket.IO handlers

### Test Credentials

After running `npm run db:seed`:

```
Email: alice@example.com
Password: password123
```

## 📚 Dependencies

**Production**:
- `express` 5.1.0 - Web framework
- `socket.io` 4.8.3 - Real-time communication
- `drizzle-orm` 0.45.1 - Type-safe ORM
- `@neondatabase/serverless` - Neon PostgreSQL driver
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `zod` 4.2.1 - Schema validation
- `pino` - Logging
- `helmet` - Security headers
- `cors` - CORS middleware
- `express-rate-limit` - Rate limiting

**Development**:
- `tsx` - TypeScript executor
- `vitest` - Testing framework
- `drizzle-kit` - Database migrations

## 🛠️ Database Commands

```bash
# Push schema changes
npm run db:push

# Generate migrations
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Open Drizzle Studio
npm run db:studio
```

## 🚀 Production Deployment

### Build & Start

```bash
# Install dependencies
npm install --production

# Start server
NODE_ENV=production node src/index.ts
```

### Environment Setup

Ensure all environment variables are set:
- `DATABASE_URL` - Production database URL
- `JWT_SECRET` - Strong secret (32+ characters)
- `JWT_REFRESH_SECRET` - Different strong secret
- `CLIENT_URL` - Production frontend URL
- `NODE_ENV=production`

### Recommended Hosting
- **Platform**: Railway, Render, AWS EC2, Google Cloud Run
- **Database**: Neon, Supabase, AWS RDS
- **Reverse Proxy**: Nginx, Caddy (for SSL/TLS)

## 📄 License

MIT License - See root LICENSE file for details.
