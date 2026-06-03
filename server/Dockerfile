# Server Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies first (including devDependencies for build)
RUN npm install --no-audit

# Copy source files (excluding dist and node_modules via .dockerignore)
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --omit=dev

ENV NODE_ENV=production

# Expose port
EXPOSE 3001

# Prepare entrypoint script
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Run the application with migrations
ENTRYPOINT ["./docker-entrypoint.sh"]
