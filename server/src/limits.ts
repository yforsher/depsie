import { and, count, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { db } from './db/client.js';
import { aiUsage } from './db/schema.js';
import { log } from './log.js';
import type { User } from './users.js';

// Every limit on reports, in one place, counted in reports rather than dollars so users see a
// number they understand. Each report costs two AI calls (about $0.0023 in all).
export const REPORTS_PER_HOUR = 10;
export const USER_DAILY_REPORTS = 10;
// Anonymous reports per IP in 24 hours, so one visitor cannot use up the shared daily cap. Kept
// in memory: an IP is never stored.
export const ANONYMOUS_REPORTS_PER_IP_PER_DAY = 10;
// Shared by all anonymous use (about $1), so a burst from many IPs still has a fixed daily cost.
export const ANONYMOUS_DAILY_REPORTS = 400;

// The answer while the database cannot be reached: no report can be checked against the caps.
export const UNAVAILABLE = 'Reports are unavailable right now.';

// Today in UTC, as ai_usage stores it (YYYY-MM-DD).
export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Today's reports of one signed-in user, or of all anonymous use together. Every report and
// refresh makes one query expansion call first, recorded even when the report then fails.
async function reportsToday(userId: string | null) {
  const owner = userId ? eq(aiUsage.user_id, userId) : isNull(aiUsage.user_id);
  const [row] = await db()
    .select({ reports: count() })
    .from(aiUsage)
    .where(and(owner, eq(aiUsage.source, 'query_expansion'), eq(aiUsage.day, utcToday())));
  // A count always returns one row.
  return row!.reports;
}

// Runs before any AI call. Without the database the count cannot be checked, so no report runs.
export const checkDailyCap: RequestHandler = async (_req, res, next) => {
  const userId = (res.locals.user as User | undefined)?.id ?? null;
  let reports: number;
  try {
    reports = await reportsToday(userId);
  } catch (error) {
    log(`daily cap check failed: ${(error as Error).message}`, 'ERROR');
    res.status(503).json({ error: UNAVAILABLE });
    return;
  }
  if (reports >= (userId ? USER_DAILY_REPORTS : ANONYMOUS_DAILY_REPORTS)) {
    log('daily report cap reached');
    res
      .status(429)
      .json({ error: 'The daily limit for reports was reached; it resets at midnight UTC.' });
    return;
  }
  next();
};
