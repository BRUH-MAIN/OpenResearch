# Docker Setup for OpenResearch

This directory contains Docker configurations for running OpenResearch in both development and production environments.

## Quick Start

### Production Build

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Development Build (with hot reload)

```bash
# Build and start all services in development mode
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop all services
docker-compose -f docker-compose.dev.yml down
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
POSTGRES_USER=openresearch
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=openresearch

# JWT Secrets (must be at least 32 characters)
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_REFRESH_SECRET=your-different-refresh-key-change-in-production-32-chars

# AI Integration (optional)
GEMINI_API_KEY=your_gemini_api_key

# URLs (for production deployment)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
CLIENT_URL=http://localhost:3000
```

## Services

### PostgreSQL Database
- **Port**: 5433 (host) → 5432 (container)
- **Volume**: `postgres_data` for data persistence
- **Health Check**: Automatic readiness check
- **Resources**: Limited to 1 CPU, 512MB RAM

### Backend Server
- **Port**: 3001
- **Features**:
  - Multi-stage build for optimized image size
  - Non-root user for security
  - Health check endpoint at `/health`
  - Signal handling with dumb-init
  - Resource limits
- **Build**: Uses TypeScript compilation
- **Production**: Runs compiled JavaScript

### Frontend Client
- **Port**: 3000
- **Features**:
  - Multi-stage build with Next.js standalone output
  - Non-root user for security
  - Optimized static assets
  - Resource limits
- **Build**: Next.js production build
- **Production**: Runs standalone server

## Docker Architecture

### Production Dockerfile Features

#### Server (`server/Dockerfile`)
- **Stage 1 (Builder)**: Installs all dependencies and builds TypeScript
- **Stage 2 (Production)**: 
  - Minimal runtime image
  - Only production dependencies
  - Non-root `nodejs` user
  - Health checks
  - Proper signal handling

#### Client (`client/Dockerfile`)
- **Stage 1 (Dependencies)**: Installs npm packages
- **Stage 2 (Builder)**: Builds Next.js application
- **Stage 3 (Production)**:
  - Minimal runtime with standalone output
  - Non-root `nextjs` user
  - Static assets optimized
  - Health checks

### Development Dockerfiles

Located at `server/Dockerfile.dev` and `client/Dockerfile.dev`:
- Hot reload enabled
- Source code mounted as volumes
- Debug ports exposed (9229 for Node.js)
- Development dependencies included

## Useful Commands

### Build individual services

```bash
# Build server only
docker-compose build server

# Build client only
docker-compose build client

# Force rebuild without cache
docker-compose build --no-cache
```

### View container logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f postgres
```

### Execute commands in containers

```bash
# Server shell
docker-compose exec server sh

# Client shell
docker-compose exec client sh

# Postgres shell
docker-compose exec postgres psql -U openresearch
```

### Database operations

```bash
# Run migrations
docker-compose exec server npm run db:push

# Seed database
docker-compose exec server npm run db:seed

# Backup database
docker-compose exec postgres pg_dump -U openresearch openresearch > backup.sql

# Restore database
docker-compose exec -T postgres psql -U openresearch openresearch < backup.sql
```

### Health checks

```bash
# Check server health
curl http://localhost:3001/health

# Detailed health info
curl http://localhost:3001/health/detailed

# Check all container health
docker-compose ps
```

### Resource monitoring

```bash
# View resource usage
docker stats

# View specific container
docker stats openresearch-server
```

## Production Deployment

### Security Considerations

1. **Change default secrets**: Update JWT secrets in `.env`
2. **Use strong passwords**: Generate secure database passwords
3. **Environment variables**: Never commit `.env` files
4. **Network isolation**: Services communicate via internal network
5. **Non-root users**: All services run as non-root users
6. **Resource limits**: Prevents resource exhaustion

### Scaling

```bash
# Scale server instances (requires load balancer)
docker-compose up -d --scale server=3
```

### Updates and Rollbacks

```bash
# Pull latest images
docker-compose pull

# Recreate containers with new images
docker-compose up -d --force-recreate

# Rollback to specific version
docker-compose down
docker-compose up -d
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs [service-name]

# Check container status
docker-compose ps

# Restart specific service
docker-compose restart [service-name]
```

### Database connection issues

```bash
# Check database health
docker-compose exec postgres pg_isready

# View database logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d postgres
```

### Build failures

```bash
# Clean build cache
docker builder prune

# Remove all unused images
docker image prune -a

# Complete reset
docker-compose down -v
docker system prune -a --volumes
```

## Network Configuration

All services communicate through the `openresearch-network` bridge network:
- Internal DNS resolution by service name
- Isolated from host network
- Port mapping for external access

## Volume Management

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect openresearch_postgres_data

# Backup volume
docker run --rm -v openresearch_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data

# Restore volume
docker run --rm -v openresearch_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /
```

## Performance Optimization

- Multi-stage builds reduce image size by ~60%
- Standalone Next.js output reduces client image size
- Layer caching optimizes rebuild times
- Resource limits prevent OOM issues
- Health checks ensure service reliability

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Next.js Docker Documentation](https://nextjs.org/docs/deployment#docker-image)
