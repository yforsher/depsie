import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { db, openDatabase } from './client.js';

it('opens an in-memory database with the migrations applied when DATABASE_URL is memory', async () => {
  vi.stubEnv('DATABASE_URL', 'memory');

  await openDatabase();

  const result = await db().execute(sql`select count(*)::int as count from events`);
  expect(result.rows).toEqual([{ count: 0 }]);
  expect(db()).toBe(db());
});
