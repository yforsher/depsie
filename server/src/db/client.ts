import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Built on each call, so a missing DATABASE_URL fails only that query instead of server start.
export function db() {
  return drizzle({ client: neon(process.env.DATABASE_URL!) });
}
