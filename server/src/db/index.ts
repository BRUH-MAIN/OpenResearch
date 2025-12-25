import { drizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import ws from 'ws';
import * as schema from './schema.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';

// Check if we're using Neon (production) or local PostgreSQL
const isNeon = process.env.DATABASE_URL?.includes('neon.tech') || 
               process.env.DATABASE_URL?.includes('pooler');

let db: NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;

if (isNeon) {
  // Use Neon driver for production
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  db = drizzle(pool, { schema });
} else {
  // Use standard pg driver for local PostgreSQL
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL! });
  db = drizzlePg(pool, { schema });
}

export { db };
export * from './schema.js';
