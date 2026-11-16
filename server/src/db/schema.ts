import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Anonymous analytics: one row per visit and per report request. Never the need text,
// dependency names, the report or the IP address.
export const events = pgTable(
  'events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    kind: text().notNull(),
    // Hash of the IP with a salt that is replaced daily and never stored, so it only links the
    // events of one visitor within one day.
    visitor: text().notNull(),
    // ISO 3166 country code from the IP; null when unknown.
    country: text(),
    // Report requests only.
    framework: text(),
    status: smallint(),
    prompt_tokens: integer(),
    completion_tokens: integer(),
    cost: numeric({ mode: 'number' }),
  },
  // Named as Postgres named the inline check in the hand-made table, so both schemas compare equal.
  (table) => [check('events_kind_check', sql`${table.kind} in ('visit', 'report')`)],
);
