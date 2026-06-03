# Deployment Guide

This guide covers deploying OpenResearch to production environments.

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Client     │────▶│   Server     │────▶│   PostgreSQL     │
│  (Next.js)   │     │  (Node.js)   │     │  + pgvector      │
│              │◀────│              │     └──────────────────┘
│  Port 3000   │     │  Port 3001   │              ▲
└──────────────┘     └──────┬───────┘              │
                            │                       │
                            ▼                       │
                     ┌──────────────┐              │
                     │  AI Service  │──────────────┘
                     │  (FastAPI)   │
                     │  Port 8000   │
                     └──────────────┘
```

## Docker Deployment

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum recommended for the AI service container
- PostgreSQL 16+ with pgvector extension

### Quick Start with Docker Compose

1. **Clone the repository**
```bash
git clone https://github.com/your-org/openresearch.git
cd openresearch
```

2. **Create environment files**

For Docker Compose, create `.env.docker` in the root directory. The compose file loads `.env.docker`, not `.env`.

```powershell
Copy-Item .env.docker.example .env.docker
```

Use this shape in `.env.docker`:
```env
# Database
DATABASE_URL=postgresql://postgres:password@postgres:5432/openresearch

# Server
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-change-in-production
JWT_REFRESH_SECRET=your-different-super-secret-refresh-key-minimum-32-characters
PORT=3001
CLIENT_URL=http://localhost:3000
NODE_ENV=production

# Client
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001

# AI Service
GROQ_API_KEY=your-groq-api-key-from-console
GROQ_MODEL=llama-3.3-70b-versatile
# Embeddings use local SPECTER2 model (768-dim) — no OpenAI key needed
```

3. **Start all services**
```bash
docker compose up -d --build
```

4. **Initialize the database**
```bash
# Run migrations
docker compose exec server npm run db:push

# Seed with sample data (optional)
docker compose exec server npm run db:seed:prod
```

5. **Access the application**
- Frontend: http://localhost:3000
- API: http://localhost:3001
- AI Service: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Docker Compose Services

The `docker-compose.yml` includes:

- **db**: PostgreSQL 16 with pgvector extension
- **server**: Node.js backend (Express + Socket.IO)
- **client**: Next.js frontend
- **ai-service**: Python FastAPI AI service

### Windows Test Deployment

For the fastest same-machine multi-user test setup on Windows, use the repo helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-multiuser-chat.ps1 -Seed
```

Use `-Dev` to layer `docker-compose.dev.yml` on top of the base stack for bind-mounted development containers.

For LAN access from another machine, pass the Windows host's LAN IP so the frontend is built with browser-facing URLs instead of `localhost`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-multiuser-chat.ps1 -Seed -PublicHost 192.168.1.50
```

This helper:

- validates that `.env.docker` exists
- starts the full stack with `docker compose`
- waits for the server and AI health endpoints
- optionally seeds the shared test users and groups

The AI service can take a few minutes to become healthy on first start while the embedding model fallback chain is loaded and cached.

For LAN testing, also ensure Windows Defender Firewall allows inbound TCP traffic on ports `3000`, `3001`, and `8000` from your local network.

The default seeded accounts for group-chat testing are created by `server/src/seed.ts`, including `alice@example.com`, `bob@example.com`, `carol@example.com`, and `david@example.com` with password `password123`.

Use `npm run db:seed:prod` inside the Docker server container because the production image prunes dev dependencies and does not include the `tsx` runner used by the local-only `db:seed` script.

## Production Deployment

### Database Setup

#### Using Neon (Recommended for Production)

1. Create a Neon account at [neon.tech](https://neon.tech)
2. Create a new project
3. Enable the pgvector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. Copy the connection string to your `.env` files

#### Using Self-Hosted PostgreSQL

1. Install PostgreSQL 16+
2. Install pgvector extension:
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql-16-pgvector
   
   # macOS
   brew install pgvector
   ```
3. Enable extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Backend Server Deployment

#### Railway

1. Create new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables
4. Deploy from `server/` directory
5. Set start command: `node src/index.ts`

#### Render

1. Create new Web Service on [Render](https://render.com)
2. Connect repository
3. Set root directory: `server`
4. Build command: `npm install`
5. Start command: `node src/index.ts`
6. Add environment variables

#### AWS EC2

```bash
# SSH into your EC2 instance
ssh -i key.pem ubuntu@your-ec2-ip

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone and setup
git clone https://github.com/your-org/openresearch.git
cd openresearch/server
npm install --production

# Setup environment
cp .env.example .env
nano .env

# Run with PM2
npm install -g pm2
pm2 start src/index.ts --name openresearch-server
pm2 save
pm2 startup
```

### Frontend Deployment

#### Vercel (Recommended)

1. Import project on [Vercel](https://vercel.com)
2. Set root directory to `client`
3. Add environment variables:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_WS_URL`
4. Deploy

#### Netlify

1. Connect repository on [Netlify](https://netlify.com)
2. Build settings:
   - Base directory: `client`
   - Build command: `npm run build`
   - Publish directory: `client/.next`
3. Add environment variables
4. Deploy

### AI Service Deployment

#### Railway/Render

1. Create new service
2. Set root directory: `ai-service`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables:
   - `GROQ_API_KEY`
   - `DATABASE_URL`

#### Google Cloud Run

```bash
# Build and push Docker image
cd ai-service
docker build -t gcr.io/your-project/ai-service .
docker push gcr.io/your-project/ai-service

# Deploy
gcloud run deploy ai-service \
  --image gcr.io/your-project/ai-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GROQ_API_KEY=xxx,DATABASE_URL=xxx
```

## Environment Variables Reference

### Server (Node.js)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Yes | JWT signing secret (32+ chars) | `random-string-min-32-characters` |
| `JWT_REFRESH_SECRET` | Yes | Refresh token secret (32+ chars) | `different-random-string-32-chars` |
| `PORT` | No | Server port | `3001` |
| `CLIENT_URL` | No | Frontend URL for CORS | `http://localhost:3000` |
| `NODE_ENV` | No | Environment mode | `production` |
| `AI_SERVICE_URL` | No | AI service URL | `http://ai-service:8000` |

### Client (Next.js)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL | `https://api.example.com` |
| `NEXT_PUBLIC_WS_URL` | Yes | WebSocket URL | `wss://api.example.com` |

### AI Service (Python)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM | `gsk_xxx` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://...` |
| `GROQ_MODEL` | No | LLM model name | `llama-3.3-70b-versatile` |
| `DEBUG` | No | Enable debug logging | `false` |

## Health Checks

### Server Health Check
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-01T10:00:00.000Z",
  "uptime": 3600,
  "database": "connected"
}
```

### AI Service Health Check
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "groq_configured": true,
  "database_connected": true,
  "vector_store_connected": true,
  "timestamp": "2026-02-01T10:00:00.000Z"
}
```

## Monitoring

### Logs

**Docker:**
```bash
docker-compose logs -f server
docker-compose logs -f ai-service
docker-compose logs -f client
```

**PM2:**
```bash
pm2 logs openresearch-server
pm2 monit
```

### Database Monitoring

```sql
-- Check vector store size
SELECT COUNT(*) FROM group_paper_vectors;

-- Check groups and members
SELECT g.name, COUNT(gm.user_id) as member_count
FROM groups g
LEFT JOIN group_members gm ON g.id = gm.group_id
GROUP BY g.id, g.name;

-- Check AI artifacts
SELECT artifact_type, COUNT(*) as count
FROM ai_artifacts
GROUP BY artifact_type;
```

## Scaling

### Horizontal Scaling

- **Server**: Multiple instances behind load balancer (requires Redis for Socket.IO adapter)
- **AI Service**: Multiple instances with load balancing
- **Database**: Use read replicas for read-heavy operations

### Vertical Scaling

- Increase database resources for large vector stores
- Increase AI service memory for embedding operations
- Use connection pooling for database

## Security

### Production Checklist

- [ ] Change all default secrets and API keys
- [ ] Use HTTPS for all services
- [ ] Enable CORS only for trusted domains
- [ ] Use environment-specific .env files
- [ ] Enable database SSL connections
- [ ] Set up firewall rules
- [ ] Regular security updates
- [ ] Monitor API rate limits
- [ ] Backup database regularly
- [ ] Use secrets management (AWS Secrets Manager, Vault)

## Backup and Recovery

### Database Backup

```bash
# Backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup-20260201.sql
```

### Automated Backups (Neon)

Neon provides automated backups. Configure retention policy in dashboard.

## Troubleshooting

### Common Issues

**AI Service Connection Failed**
- Check `AI_SERVICE_URL` in server .env
- Verify AI service is running: `curl http://ai-service:8000/health`
- Check network connectivity between services

**Vector Store Not Working**
- Verify pgvector extension is installed: `SELECT * FROM pg_extension WHERE extname = 'vector';`
- Check embedding dimensions match (768)
- Embeddings use local SPECTER2 model — no API key needed

**Socket.IO Connection Issues**
- Check CORS settings in server
- Verify `NEXT_PUBLIC_WS_URL` matches server URL
- Check firewall rules for WebSocket connections

**Database Connection Errors**
- Verify DATABASE_URL is correct
- Check database is running and accessible
- Verify SSL settings if required
