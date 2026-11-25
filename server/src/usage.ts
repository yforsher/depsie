import { AsyncLocalStorage } from 'node:async_hooks';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import type { UsageDay, UsageResponse } from 'shared';
import { db } from './db/client.js';
import { aiUsage } from './db/schema.js';
import { USER_DAILY_REPORTS, utcToday } from './limits.js';
import { log } from './log.js';
import type { User } from './users.js';

interface UsageContext {
  userId: string | null;
  // Set once the report is known to be saved, before any AI call.
  reportId: string | null;
}

const current = new AsyncLocalStorage<UsageContext>();

// Runs the rest of the request with the signed-in user (or none), so every AI call made for it is
// recorded with that user without passing the id through the pipeline.
export const usageUser: RequestHandler = (_req, res, next) => {
  const userId = (res.locals.user as User | undefined)?.id ?? null;
  current.run({ userId, reportId: null }, next);
};

// The saved report the rest of the request's AI calls are made for.
export function setUsageReport(reportId: string) {
  current.getStore()!.reportId = reportId;
}

// One ai_usage row per AI call, written as soon as OpenRouter reports the usage, so a call whose
// answer is rejected afterwards still counts toward the daily caps. Not awaited and only logged on
// failure, like analytics: the daily cap check before each report fails closed instead.
export function recordAiUsage(
  source: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  cost: number,
) {
  const context = current.getStore();
  db()
    .insert(aiUsage)
    .values({
      user_id: context?.userId ?? null,
      report_id: context?.reportId ?? null,
      source,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost,
    })
    .catch((error: Error) => log(`ai usage write failed: ${error.message}`, 'ERROR'));
}

// A signed-in user's usage per UTC day over the last 30 days, from ai_usage only. Every report and
// refresh makes exactly one query_expansion call, so those rows count the reports run.
export async function usageOf(userId: string): Promise<UsageResponse> {
  const days: UsageDay[] = await db()
    .select({
      day: aiUsage.day,
      reports: sql`count(*) filter (where ${aiUsage.source} = 'query_expansion')`.mapWith(Number),
      tokens: sql`sum(${aiUsage.prompt_tokens} + ${aiUsage.completion_tokens})`.mapWith(Number),
    })
    .from(aiUsage)
    .where(
      and(eq(aiUsage.user_id, userId), sql`${aiUsage.day} > (now() at time zone 'utc')::date - 30`),
    )
    .groupBy(aiUsage.day)
    .orderBy(desc(aiUsage.day));
  const todayReports = days.find((d) => d.day === utcToday())?.reports ?? 0;
  return { days, todayReports, dailyCap: USER_DAILY_REPORTS };
}
