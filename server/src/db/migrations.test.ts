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
  ]);
  const applied = await client.query('select * from drizzle.__drizzle_migrations');
  expect(applied.rows).toHaveLength(7);
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
    'report_id',
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
    'report_versions',
    'reports',
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

async function columnsOf(client: PGlite, table: string) {
  const result = await client.query(
    `select column_name, data_type, is_nullable from information_schema.columns
     where table_name = $1 order by ordinal_position`,
    [table],
  );
  return result.rows;
}

it('builds the reports and report_versions tables', async () => {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder });

  expect(await columnsOf(client, 'reports')).toEqual([
    { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    { column_name: 'user_id', data_type: 'text', is_nullable: 'YES' },
    { column_name: 'share_id', data_type: 'text', is_nullable: 'YES' },
    { column_name: 'need', data_type: 'text', is_nullable: 'NO' },
    { column_name: 'framework', data_type: 'text', is_nullable: 'NO' },
    { column_name: 'dependencies', data_type: 'jsonb', is_nullable: 'NO' },
    { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
  ]);
  expect(await columnsOf(client, 'report_versions')).toEqual([
    { column_name: 'report_id', data_type: 'uuid', is_nullable: 'NO' },
    { column_name: 'version', data_type: 'integer', is_nullable: 'NO' },
    { column_name: 'schema_version', data_type: 'integer', is_nullable: 'NO' },
    { column_name: 'report', data_type: 'jsonb', is_nullable: 'NO' },
    { column_name: 'source', data_type: 'text', is_nullable: 'NO' },
    { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
  ]);
  // A plain uuid, not a foreign key: usage rows are written before the report row exists.
  expect((await columnsOf(client, 'ai_usage')).at(-1)).toEqual({
    column_name: 'report_id',
    data_type: 'uuid',
    is_nullable: 'YES',
  });
});

it('keeps share ids unique, one version number per report, and only the known sources', async () => {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder });
  const report = (id: string, shareId: string) =>
    client.exec(`insert into reports (id, share_id, need, framework, dependencies, expires_at)
      values ('${id}', '${shareId}', 'n', 'React', '[]', now() + interval '1 day')`);
  const version = (version: number, source: string) =>
    client.exec(`insert into report_versions (report_id, version, schema_version, report, source)
      values ('00000000-0000-4000-8000-000000000001', ${version}, 1, '{}', '${source}')`);

  await report('00000000-0000-4000-8000-000000000001', 's1');
  await expect(report('00000000-0000-4000-8000-000000000002', 's1')).rejects.toThrow();
  await version(1, 'pipeline');
  await expect(version(1, 'refresh')).rejects.toThrow();
  await expect(version(2, 'other')).rejects.toThrow();
});

it('deletes a report with its versions, and a user with their reports', async () => {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder });
  await client.exec(`
    insert into "user" (id, name, email, updated_at) values ('u1', 'A', 'a@example.com', now());
    insert into reports (id, user_id, need, framework, dependencies, expires_at) values
      ('00000000-0000-4000-8000-000000000001', 'u1', 'n', 'React', '[]', now() + interval '1 day'),
      ('00000000-0000-4000-8000-000000000002', null, 'n', 'React', '[]', now() + interval '1 day'),
      ('00000000-0000-4000-8000-000000000003', null, 'n', 'React', '[]', now() + interval '1 day');
    insert into report_versions (report_id, version, schema_version, report, source)
      select id, 1, 1, '{}', 'pipeline' from reports;
    delete from "user" where id = 'u1';
    delete from reports where id = '00000000-0000-4000-8000-000000000002';
  `);

  const left = await client.query('select report_id from report_versions');
  expect(left.rows).toEqual([{ report_id: '00000000-0000-4000-8000-000000000003' }]);
  expect((await client.query('select id from reports')).rows).toEqual([
    { id: '00000000-0000-4000-8000-000000000003' },
  ]);
});
