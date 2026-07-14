# Server Dockerfile — multi-stage, so the runtime image carries no TypeScript
# compiler, no dev dependencies, and no source.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /app

# wget backs the compose healthcheck
RUN apk add --no-cache wget

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output, the migrations applied at boot, and the entrypoint.
COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./

RUN sed -i 's/\r$//' docker-entrypoint.sh \
    && chmod +x docker-entrypoint.sh \
    && addgroup -S app && adduser -S -G app app \
    && chown -R app:app /app
USER app

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
