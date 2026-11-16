import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, it, vi } from 'vitest';
import { migrationsFolder } from './migrations.js';

// Each test starts PGlite (WebAssembly) and applies every migration: real CPU work that took up to
// 5.2 s on a busy CI runner, over Vitest's 5 s default.
vi.setConfig({ testTimeout: 30_000 });

it('builds the events table on an empty database and applies each migration once', async () => {
  const client = new PGlite();
  const db = drizzle({ client });

  await migrate(db, { migrationsFolder });
  await migrate(db, { migrationsFolder });

  const columns = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'events' order by ordinal_position`,
  );
  expect(columns.rows.map((row) => (row as { column_name: string }).column_name)).toEqual([
    'id',
    'at',
    'kind',
    'visitor',
    'country',
    'framework',
    'status',
    'prompt_tokens',
    'completion_tokens',
    'cost',
  ]);
  const applied = await client.query('select * from drizzle.__drizzle_migrations');
  expect(applied.rows).toHaveLength(5);
});

it('builds the ai_usage table, one row per AI call', async () => {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder });

  const columns = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'ai_usage' order by ordinal_position`,
  );
  expect(columns.rows.map((row) => (row as { column_name: string }).column_name)).toEqual([
    'id',
    'user_id',
    'source',
    'model',
    'prompt_tokens',
    'completion_tokens',
    'cost',
    'day',
  ]);
});

// Only the UTC day of a call, not its time, so a user's AI calls cannot be matched by time to the
// anonymous events rows.
it('keeps the UTC day of each AI call, not its time', async () => {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder });
  await client.exec(
    `insert into ai_usage (source, model, prompt_tokens, completion_tokens, cost)
     values ('comparison', 'm', 1, 1, 0.001)`,
  );

  const type = await client.query(
    `select data_type from information_schema.columns where table_name = 'ai_usage' and column_name = 'day'`,
  );
  expect(type.rows).toEqual([{ data_type: 'date' }]);
  const row = await client.query(
    `select day::text = (now() at time zone 'utc')::date::text as today from ai_usage`,
  );
  expect(row.rows).toEqual([{ today: true }]);
});

it('builds the account tables, and deleting a user deletes their AI usage', async () => {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder });

  const tables = await client.query(
    `select table_name from information_schema.tables where table_schema = 'public'
     order by table_name`,
  );
  expect(tables.rows.map((row) => (row as { table_name: string }).table_name)).toEqual([
    'account',
    'ai_usage',
    'events',
    'session',
    'user',
    'verification',
  ]);
  await client.exec(`
    insert into "user" (id, name, email, updated_at) values ('u1', 'A', 'a@example.com', now());
    insert into ai_usage (user_id, source, model, prompt_tokens, completion_tokens, cost)
      values ('u1', 'comparison', 'm', 1, 1, 0.001), (null, 'comparison', 'm', 1, 1, 0.001);
    delete from "user" where id = 'u1';
  `);
  const left = await client.query('select user_id from ai_usage');
  expect(left.rows).toEqual([{ user_id: null }]);
});
