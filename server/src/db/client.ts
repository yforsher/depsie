import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { migrationsFolder } from './migrations.js';

let instance: PgDatabase<PgQueryResultHKT> | undefined;

// DATABASE_URL=memory runs an in-process Postgres built from the migrations, for local runs and
// the e2e smoke test. It must be migrated before the first query, so the server awaits this once
// at startup. PGlite is a dev dependency, imported only here, so production never loads it.
export async function openDatabase() {
  if (process.env.DATABASE_URL !== 'memory') return;
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const memoryDb = drizzlePglite({ client: new PGlite() });
  await migrate(memoryDb, { migrationsFolder });
  instance = memoryDb;
}

// Created on first use, so a missing DATABASE_URL fails that query instead of server start.
export function db() {
  instance ??= drizzle({ client: neon(process.env.DATABASE_URL!) });
  return instance;
}
