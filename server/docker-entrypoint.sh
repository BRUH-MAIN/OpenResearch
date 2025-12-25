#!/bin/sh
set -e

echo "🔄 Running database migrations..."
npm run db:push

echo "🌱 Seeding database..."
npm run db:seed || echo "⚠️  Seeding skipped (may already be seeded)"

echo "🚀 Starting server..."
exec node dist/index.js
