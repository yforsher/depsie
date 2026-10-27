import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import type { Request, RequestHandler } from 'express';
import geoip from 'geoip-country';
import type { Framework } from 'shared';
import { log } from './log.js';

// The only fields ever recorded; see sql/schema.sql and the privacy section in AGENTS.md.
interface ReportFields {
  framework: Framework | null;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

const reports = new AsyncLocalStorage<ReportFields>();

// Replaced on the first event of each UTC day and kept only in memory, so a visitor's hash
// cannot be linked across days.
let salt = { day: '', value: '' };

function visitorHash(ip: string): string {
  const day = new Date().toISOString().slice(0, 10);
  if (salt.day !== day) salt = { day, value: randomBytes(32).toString('hex') };
  return createHash('sha256')
    .update(salt.value + ip)
    .digest('hex')
    .slice(0, 16);
}

type Event = { kind: 'visit' } | ({ kind: 'report'; status: number } & ReportFields);

async function insert(ip: string, event: Event) {
  const report = event.kind === 'report' ? event : undefined;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`insert into events
    (kind, visitor, country, framework, status, prompt_tokens, completion_tokens, cost)
    values (${event.kind}, ${visitorHash(ip)}, ${geoip.lookup(ip)?.country ?? null},
      ${report?.framework ?? null}, ${report?.status ?? null}, ${report?.promptTokens ?? null},
      ${report?.completionTokens ?? null}, ${report?.cost ?? null})`;
}

// Not awaited, so the write never delays or fails the response; a failure, including a missing
// DATABASE_URL, is only logged.
function record(req: Request, event: Event) {
  insert(req.ip ?? '', event).catch((error: Error) =>
    log(`analytics failed: ${error.message}`, 'analytics'),
  );
}

export function recordVisit(req: Request) {
  record(req, { kind: 'visit' });
}

export const reportAnalytics: RequestHandler = (req, res, next) => {
  const fields: ReportFields = { framework: null, promptTokens: 0, completionTokens: 0, cost: 0 };
  res.on('finish', () => record(req, { kind: 'report', status: res.statusCode, ...fields }));
  reports.run(fields, next);
};

export function setFramework(framework: Framework) {
  const fields = reports.getStore();
  if (fields) fields.framework = framework;
}

export function addUsage(promptTokens: number, completionTokens: number, cost: number) {
  const fields = reports.getStore();
  if (!fields) return;
  fields.promptTokens += promptTokens;
  fields.completionTokens += completionTokens;
  fields.cost += cost;
}
