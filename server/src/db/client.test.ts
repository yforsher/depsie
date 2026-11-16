import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { db } from './client.js';
import { events } from './schema.js';

// The production driver against a real Neon database; runs in CI on the pull request's branch.
it.runIf(process.env.DATABASE_URL)('writes and reads an event through Neon', async () => {
  const [row] = await db()
    .insert(events)
    .values({ kind: 'visit', visitor: 'client-test' })
    .returning();

  const [read] = await db().select().from(events).where(eq(events.id, row!.id));
  await db().delete(events).where(eq(events.id, row!.id));

  expect(read).toMatchObject({ kind: 'visit', visitor: 'client-test', country: null });
  expect(read!.at).toBeInstanceOf(Date);
});
