import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import { db } from './db/client.js';
import { aiUsage } from './db/schema.js';
import { log } from './log.js';
import type { User } from './users.js';

const currentUser = new AsyncLocalStorage<string | null>();

// Runs the rest of the request with the signed-in user (or none), so every AI call made for it is
// recorded with that user without passing the id through the pipeline.
export const usageUser: RequestHandler = (_req, res, next) => {
  currentUser.run((res.locals.user as User | undefined)?.id ?? null, next);
};

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
  db()
    .insert(aiUsage)
    .values({
      user_id: currentUser.getStore() ?? null,
      source,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost,
    })
    .catch((error: Error) => log(`ai usage write failed: ${error.message}`));
}
