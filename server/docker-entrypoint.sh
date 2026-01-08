#!/bin/sh
set -e

echo "🔄 Running database migrations..."

# Apply migrations using the pre-generated SQL files directly with psql
# This avoids needing drizzle-kit in production
for sql_file in /app/drizzle/[0-9]*.sql; do
  if [ -f "$sql_file" ]; then
    echo "Applying migration: $(basename $sql_file)"
    # Use node to run the migration since we don't have psql
    node -e "
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
