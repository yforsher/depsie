import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import { db } from './db/client.js';
import { aiUsage } from './db/schema.js';
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
// answer is rejected afterwards still counts toward the cost caps. Not awaited and only logged on
// failure, like analytics: the cost cap check before each report fails closed instead.
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
    .catch((error: Error) => log(`ai usage write failed: ${error.message}`));
}
