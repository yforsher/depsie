import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { migrationsFolder } from './migrations.js';

// The WebSocket pool, not the HTTP driver: it runs all pending migrations in one transaction,
// so a failed migration leaves the database unchanged.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await migrate(drizzle({ client: pool }), { migrationsFolder });
await pool.end();
console.log('migrations applied');
