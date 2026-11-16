import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { db, openDatabase } from './client.js';

// Each test starts PGlite (WebAssembly) and applies every migration: real CPU work that took up to
// 5.2 s on a busy CI runner, over Vitest's 5 s default.
vi.setConfig({ testTimeout: 30_000 });

it('opens an in-memory database with the migrations applied when DATABASE_URL is memory', async () => {
  vi.stubEnv('DATABASE_URL', 'memory');

  await openDatabase();

  const result = await db().execute(sql`select count(*)::int as count from events`);
  expect(result.rows).toEqual([{ count: 0 }]);
  expect(db()).toBe(db());
});
