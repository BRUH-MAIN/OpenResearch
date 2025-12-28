import * as schema from './schema.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
declare let db: NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;
export { db };
export * from './schema.js';
//# sourceMappingURL=index.d.ts.map