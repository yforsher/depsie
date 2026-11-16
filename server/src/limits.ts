import { and, eq, isNull, sum } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { db } from './db/client.js';
import { aiUsage } from './db/schema.js';
import { log } from './log.js';
import type { User } from './users.js';

// Every limit on reports, in one place; tuned later from the usage page.
// Each report costs two AI calls (about $0.0023 in all).
export const REPORTS_PER_HOUR = 10;
// Per signed-in user, about 100 reports a day.
export const USER_DAILY_COST = 0.25;
// Shared by all anonymous use, so a burst from many IPs still has a fixed daily cost.
export const ANONYMOUS_DAILY_COST = 1;

// The answer while the database cannot be reached: no report can be checked against the caps.
export const UNAVAILABLE = 'Reports are unavailable right now.';

// Today in UTC, as ai_usage stores it (YYYY-MM-DD).
function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Today's spend of one signed-in user, or of all anonymous use together.
async function costToday(userId: string | null) {
  const owner = userId ? eq(aiUsage.user_id, userId) : isNull(aiUsage.user_id);
  const [row] = await db()
    .select({ total: sum(aiUsage.cost) })
    .from(aiUsage)
    .where(and(owner, eq(aiUsage.day, utcToday())));
  return Number(row?.total ?? 0);
}

// Runs before any AI call. Without the database the spend cannot be checked, so no report runs.
export const checkCostCap: RequestHandler = async (_req, res, next) => {
  const userId = (res.locals.user as User | undefined)?.id ?? null;
  let spent: number;
  try {
    spent = await costToday(userId);
  } catch (error) {
    log(`cost check failed: ${(error as Error).message}`);
    res.status(503).json({ error: UNAVAILABLE });
    return;
  }
  if (spent >= (userId ? USER_DAILY_COST : ANONYMOUS_DAILY_COST)) {
    log('daily cost cap reached');
    res
      .status(429)
      .json({ error: 'The daily limit for reports was reached; it resets at midnight UTC.' });
    return;
  }
  next();
};
