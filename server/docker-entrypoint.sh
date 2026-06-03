#!/bin/sh
set -e

echo "🔄 Running database migrations..."

# Ensure pgvector extension exists before any migration references the vector type
node --input-type=commonjs -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('CREATE EXTENSION IF NOT EXISTS vector;')
    .then(() => { console.log('  ✓ pgvector extension ready'); pool.end(); })
    .catch(err => { console.error('  ✗ pgvector error:', err.message); pool.end(); process.exit(1); });
"

# Apply migrations using the pre-generated SQL files directly with psql
# This avoids needing drizzle-kit in production
for sql_file in /app/drizzle/[0-9]*.sql; do
  if [ -f "$sql_file" ]; then
    echo "Applying migration: $(basename $sql_file)"
    # Use node to run the migration since we don't have psql
    # --input-type=commonjs is needed because package.json has "type": "module"
    node --input-type=commonjs -e "
      const { Pool } = require('pg');
      const fs = require('fs');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const sql = fs.readFileSync('$sql_file', 'utf8');
      pool.query(sql)
        .then(() => { console.log('  ✓ Applied'); pool.end(); })
        .catch(err => {
          // Ignore 'already exists' errors for idempotent migrations
          if (err.message.includes('already exists') || err.message.includes('duplicate')) {
            console.log('  ⏭ Already applied');
            pool.end();
          } else {
            console.error('  ✗ Error:', err.message);
            pool.end();
            process.exit(1);
          }
        });
    "
  fi
done

echo "✅ Migrations complete"
echo "🚀 Starting server..."

exec node dist/index.js
