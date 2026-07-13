import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Applies pending migrations from ./drizzle transactionally and records them
// in drizzle.__drizzle_migrations, so each migration runs exactly once.
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
  console.log('✅ Database migrations applied');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
