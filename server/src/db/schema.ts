import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Dependency } from 'shared';

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
    // No tokens or cost: those live only in ai_usage, so events cannot be matched to a signed-in
    // user's calls.
  },
  // Named as Postgres named the inline check in the hand-made table, so both schemas compare equal.
  (table) => [check('events_kind_check', sql`${table.kind} in ('visit', 'report')`)],
);

// One row per AI call, with the signed-in user (null when anonymous). The daily cost caps and the
// usage page read only this table; the anonymous events table is never linked to users.
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    user_id: text().references(() => user.id, { onDelete: 'cascade' }),
    // The AI step, for example query_expansion or comparison.
    source: text().notNull(),
    model: text().notNull(),
    prompt_tokens: integer().notNull(),
    completion_tokens: integer().notNull(),
    cost: numeric({ mode: 'number' }).notNull(),
    // The UTC day only, not the time: enough for the daily caps, and it keeps a user's calls from
    // being matched by time to the anonymous events rows.
    day: date({ mode: 'string' })
      .notNull()
      .default(sql`(now() at time zone 'utc')::date`),
    // The saved report the call was made for; empty when the report is not saved. No foreign key:
    // the row is written during the pipeline, before the report row exists.
    report_id: uuid(),
  },
  (table) => [
    index('ai_usage_day_idx').on(table.day),
    index('ai_usage_user_id_day_idx').on(table.user_id, table.day),
  ],
);

// Better Auth tables, generated with `npx auth generate --adapter drizzle --dialect pg` from
// src/auth.ts. Deleting a user cascades to their sessions, accounts and every user-owned row.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  githubLogin: text('github_login'),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// A saved report: the request it answers and when it is deleted (src/retention.ts). No user for an
// anonymous report. The content is in report_versions.
export const reports = pgTable(
  'reports',
  {
    id: uuid().primaryKey(),
    user_id: text().references(() => user.id, { onDelete: 'cascade' }),
    // The id in the share link; null until a link is created, and cleared when it is revoked.
    share_id: text().unique(),
    need: text().notNull(),
    framework: text().notNull(),
    dependencies: jsonb().$type<Dependency[]>().notNull(),
    expires_at: timestamp({ withTimezone: true }).notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reports_user_id_idx').on(table.user_id),
    index('reports_expires_at_idx').on(table.expires_at),
  ],
);

// Every change to a report appends a version; earlier versions are never edited.
export const reportVersions = pgTable(
  'report_versions',
  {
    report_id: uuid()
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    version: integer().notNull(),
    // The shared report schema version the report was saved with (REPORT_SCHEMA_VERSION).
    schema_version: integer().notNull(),
    report: jsonb().notNull(),
    source: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.report_id, table.version] }),
    check(
      'report_versions_source_check',
      sql`${table.source} in ('pipeline', 'refresh', 'chat', 'agent')`,
    ),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
