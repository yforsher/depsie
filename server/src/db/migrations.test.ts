import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, it } from 'vitest';
import { migrationsFolder } from './migrations.js';

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
  expect(applied.rows).toHaveLength(1);
});
