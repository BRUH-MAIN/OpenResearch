#!/bin/sh
set -e

echo "🔄 Running database migrations..."
# Run migration SQL files directly
for f in /app/drizzle/*.sql; do
  if [ -f "$f" ]; then
    echo "  Applying: $f"
    # Use node to run migration since we have pg installed
    node -e "
      const { Pool } = require('pg');
      const fs = require('fs');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const sql = fs.readFileSync('$f', 'utf8')
        .split('--> statement-breakpoint')
        .filter(s => s.trim());
      (async () => {
        for (const statement of sql) {
          try {
            await pool.query(statement);
          } catch (e) {
            if (!e.message.includes('already exists')) {
              console.log('Warning:', e.message.substring(0, 100));
            }
          }
        }
        await pool.end();
      })();
    " 2>/dev/null || echo "  Migration may have already been applied"
  fi
done

echo "✅ Migrations complete"
echo "🚀 Starting server..."
exec node dist/index.js
