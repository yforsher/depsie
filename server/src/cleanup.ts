import { fileURLToPath } from 'node:url';
import { lte, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { reports } from './db/schema.js';
import { log } from './log.js';

// Deletes every report past its deletion date; its versions go with it (ON DELETE CASCADE).
// Returns how many reports were deleted.
export async function deleteExpiredReports(): Promise<number> {
  const deleted = await db()
    .delete(reports)
    .where(lte(reports.expires_at, sql`now()`))
    .returning({ id: reports.id });
  return deleted.length;
}

// Run as a script (pnpm cleanup locally, the depsie-cleanup Cloud Run job daily): no endpoint
// reaches it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  log(`cleanup: deleted ${await deleteExpiredReports()} expired reports`);
}
