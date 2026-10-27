import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const requestIds = new AsyncLocalStorage<string>();

// Every line starts with the request ID so the lines of one request can be followed together.
// Lines never contain the need text or dependency names.
export function log(line: string, id = requestIds.getStore()) {
  console.log(`[${id}] ${line}`);
}

export function secondsSince(start: number): string {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}

export const requestLogging: RequestHandler = (_req, res, next) => {
  const id = randomUUID().slice(0, 8);
  const start = performance.now();
  // 'finish' fires outside the request's async context, so the ID is passed explicitly.
  res.on('finish', () => log(`response sent: ${res.statusCode} in ${secondsSince(start)}`, id));
  requestIds.run(id, next);
};
