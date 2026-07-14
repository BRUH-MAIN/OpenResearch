/**
 * Applies the Drizzle migrations to the test database once, before any test
 * runs. The tests then exercise the same schema the app ships with.
 */

import { beforeAll } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
}, 60_000);
