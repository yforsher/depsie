import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, type SQL, sql } from 'drizzle-orm';
import type { OwnedReport, Report, ReportRequest, SavedReport, SharedReport } from 'shared';
import { REPORT_SCHEMA_VERSION } from 'shared';
import { db } from './db/client.js';
import { reports, reportVersions } from './db/schema.js';
import { toCurrentSchema } from './reportSchema.js';
import { expiresAt } from './retention.js';

// Saves a new report with its first version. Two inserts without a transaction (the Neon HTTP
// driver has none): a report left without a version reads as missing and expires as usual.
export async function saveReport(
  id: string,
  userId: string | null,
  request: ReportRequest,
  report: Report,
): Promise<SavedReport> {
  const now = new Date();
  const expires = expiresAt({ userId, shareId: null, createdAt: now, latestVersion: now });
  await db()
    .insert(reports)
    .values({
      id,
      user_id: userId,
      need: request.need,
      framework: request.framework,
      dependencies: request.dependencies ?? [],
      expires_at: expires,
      created_at: now,
    });
  await db().insert(reportVersions).values({
    report_id: id,
    version: 1,
    schema_version: REPORT_SCHEMA_VERSION,
    report,
    source: 'pipeline',
    created_at: now,
  });
  return { id, expiresAt: expires.toISOString(), shareId: null, owned: userId !== null };
}

// The latest version of a report that is not past its deletion date, matching the condition. A
// missing, expired or other user's report reads the same: undefined, so every route answers 404.
export async function findReport(condition: SQL) {
  const [row] = await db()
    .select({
      id: reports.id,
      userId: reports.user_id,
      shareId: reports.share_id,
      expiresAt: reports.expires_at,
      createdAt: reports.created_at,
      versionCreatedAt: reportVersions.created_at,
      schemaVersion: reportVersions.schema_version,
      report: reportVersions.report,
    })
    .from(reports)
    .innerJoin(reportVersions, eq(reportVersions.report_id, reports.id))
    .where(and(condition, gt(reports.expires_at, sql`now()`)))
    .orderBy(desc(reportVersions.version))
    .limit(1);
  return row;
}

// The owner's report, latest version. userId always comes from the session.
export async function findOwnedReport(
  id: string,
  userId: string,
): Promise<OwnedReport | undefined> {
  const row = await findReport(and(eq(reports.id, id), eq(reports.user_id, userId))!);
  if (!row) return undefined;
  return {
    id: row.id,
    shareId: row.shareId,
    expiresAt: row.expiresAt.toISOString(),
    owned: true,
    ...toCurrentSchema(row.schemaVersion, row.report),
  };
}

export type FoundReport = NonNullable<Awaited<ReturnType<typeof findReport>>>;

// Sets a new share id (128 random bits, base64url), or keeps the one the report has, so asking
// twice, even at once, gives one link. An anonymous report is then kept 30 days from its creation;
// a signed-in report keeps its date, which only a new version moves.
export async function createShareLink(found: FoundReport): Promise<SavedReport> {
  const shareId = randomBytes(16).toString('base64url');
  const expires = found.userId
    ? found.expiresAt
    : expiresAt({
        userId: null,
        shareId,
        createdAt: found.createdAt,
        latestVersion: found.versionCreatedAt,
      });
  const [row] = await db()
    .update(reports)
    .set({ share_id: sql`coalesce(${reports.share_id}, ${shareId})`, expires_at: expires })
    .where(eq(reports.id, found.id))
    .returning({ shareId: reports.share_id });
  return {
    id: found.id,
    expiresAt: expires.toISOString(),
    shareId: row!.shareId,
    owned: found.userId !== null,
  };
}

// Clears the share id, so the old link stops working; a later link gets a new id.
export async function revokeShareLink(found: FoundReport): Promise<SavedReport> {
  await db().update(reports).set({ share_id: null }).where(eq(reports.id, found.id));
  return { id: found.id, expiresAt: found.expiresAt.toISOString(), shareId: null, owned: true };
}

// Any report by id, whoever owns it: the caller decides who may act on it.
export function findReportById(id: string) {
  return findReport(eq(reports.id, id));
}

// A shared report by its link, latest version, read-only. No report id: the link is all a viewer
// gets, so the id stays the creator's secret.
export async function findSharedReport(shareId: string): Promise<SharedReport | undefined> {
  const row = await findReport(eq(reports.share_id, shareId));
  if (!row) return undefined;
  return {
    expiresAt: row.expiresAt.toISOString(),
    deletable: row.userId === null,
    ...toCurrentSchema(row.schemaVersion, row.report),
  };
}

// Deletes an anonymous report and, by cascade, its versions. Signed-in reports cannot be deleted
// by link. Returns whether a report was deleted.
export async function deleteByShareLink(shareId: string): Promise<boolean> {
  const deleted = await db()
    .delete(reports)
    .where(
      and(
        eq(reports.share_id, shareId),
        isNull(reports.user_id),
        gt(reports.expires_at, sql`now()`),
      ),
    )
    .returning({ id: reports.id });
  return deleted.length > 0;
}
