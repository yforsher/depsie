import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { type Report, REPORT_SCHEMA_VERSION } from 'shared';
import request from 'supertest';
import { SpanKind } from '@opentelemetry/api';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { deleteExpiredReports } from './cleanup.js';
import { db, openDatabase } from './db/client.js';
import { fakeFetch } from './fixtureResponses.js';
import { appendVersion } from './reports.js';
import { finishedSpans, recordSpans } from './testSpans.js';
import { signedInUser } from './testUsers.js';

const spans = recordSpans();

const clientDir = mkdtempSync(join(tmpdir(), 'client-dist-'));
writeFileSync(join(clientDir, 'index.html'), '<div id="root"></div>');

const body = {
  need: 'validate forms',
  framework: 'React',
  dependencies: [{ name: 'react', range: '^19.0.0' }],
};
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'memory');
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('GITHUB_CLIENT_ID', 'client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'client-secret');
  await openDatabase();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  spans.reset();
  await db().execute(sql`delete from reports`);
  await db().execute(sql`delete from "user"`);
  await db().execute(sql`delete from ai_usage`);
});

function appWith(flags: { accounts?: string; reportLinks?: string }) {
  vi.stubEnv('FEATURE_ACCOUNTS', flags.accounts ?? '');
  vi.stubEnv('FEATURE_REPORT_LINKS', flags.reportLinks ?? '');
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  return createApp(clientDir);
}

async function rows(query: ReturnType<typeof sql>) {
  return (await db().execute(query)).rows;
}

// Expected within a minute of now + days, since the server sets it a moment before the check.
function expectDaysAhead(iso: string, days: number) {
  expect(Math.abs(new Date(iso).getTime() - (Date.now() + days * DAY_MS))).toBeLessThan(60_000);
}

describe('saving reports', () => {
  it('saves an anonymous report for 10 days while report-links is on', async () => {
    const response = await request(appWith({ reportLinks: 'on' }))
      .post('/api/report')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({ need: 'validate forms', framework: 'React' });
    const { id, expiresAt, shareId } = response.body.saved;
    expect(shareId).toBeNull();
    expect(response.body.saved.owned).toBe(false);
    expectDaysAhead(expiresAt, 10);
    expect(
      await rows(sql`select user_id, share_id, need, framework, dependencies from reports`),
    ).toEqual([
      {
        user_id: null,
        share_id: null,
        need: 'validate forms',
        framework: 'React',
        dependencies: body.dependencies,
      },
    ]);
    const versions = await rows(
      sql`select report_id, version, schema_version, source, report from report_versions`,
    );
    expect(versions).toEqual([
      {
        report_id: id,
        version: 1,
        schema_version: REPORT_SCHEMA_VERSION,
        source: 'pipeline',
        report: response.body.report,
      },
    ]);
  });

  it('saves nothing while both flags are off', async () => {
    const response = await request(appWith({})).post('/api/report').send(body);

    expect(response.status).toBe(200);
    expect(response.body.saved).toBeNull();
    expect(await rows(sql`select id from reports`)).toEqual([]);
  });

  it('saves a signed-in report to its user for 100 days', async () => {
    const alice = await signedInUser('alice');
    const response = await request(appWith({ accounts: 'on' }))
      .post('/api/report')
      .set('Cookie', alice.cookie)
      .send(body);

    expectDaysAhead(response.body.saved.expiresAt, 100);
    expect(response.body.saved.owned).toBe(true);
    expect(await rows(sql`select id, user_id from reports`)).toEqual([
      { id: response.body.saved.id, user_id: alice.id },
    ]);
  });

  it('saves nothing for an anonymous visitor while only accounts is on', async () => {
    const response = await request(appWith({ accounts: 'on' }))
      .post('/api/report')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.saved).toBeNull();
  });

  it('saves nothing for a signed-in user the accounts flag is not on for', async () => {
    const mallory = await signedInUser('mallory');
    const response = await request(appWith({ accounts: 'alice' }))
      .post('/api/report')
      .set('Cookie', mallory.cookie)
      .send(body);

    expect(response.body.saved).toBeNull();
    expect(await rows(sql`select id from reports`)).toEqual([]);
  });

  it('records the saved report on both AI usage rows', async () => {
    const response = await request(appWith({ reportLinks: 'on' }))
      .post('/api/report')
      .send(body);

    await vi.waitFor(async () =>
      expect(await rows(sql`select source, report_id from ai_usage order by id`)).toEqual([
        { source: 'query_expansion', report_id: response.body.saved.id },
        { source: 'comparison', report_id: response.body.saved.id },
      ]),
    );
  });

  it('does not link a signed-in user to the anonymous report they get while accounts is off for them', async () => {
    const mallory = await signedInUser('mallory');
    const response = await request(appWith({ accounts: 'alice', reportLinks: 'on' }))
      .post('/api/report')
      .set('Cookie', mallory.cookie)
      .send(body);

    expect(response.body.saved.owned).toBe(false);
    await vi.waitFor(async () =>
      expect(await rows(sql`select user_id, report_id from ai_usage`)).toEqual([
        { user_id: mallory.id, report_id: null },
        { user_id: mallory.id, report_id: null },
      ]),
    );
  });

  it('records no report on the AI usage rows of a report that is not saved', async () => {
    await request(appWith({})).post('/api/report').send(body);

    await vi.waitFor(async () =>
      expect(await rows(sql`select report_id from ai_usage`)).toEqual([
        { report_id: null },
        { report_id: null },
      ]),
    );
  });
});

// A saved report made directly in the database, with one version.
async function insertReport(options: {
  userId?: string | null;
  shareId?: string | null;
  expiresInDays?: number;
  schemaVersion?: number;
  report?: unknown;
}) {
  const id = crypto.randomUUID();
  const report = options.report ?? { need: 'validate forms', ranking: [] };
  await db()
    .execute(sql`insert into reports (id, user_id, share_id, need, framework, dependencies, expires_at)
    values (${id}, ${options.userId ?? null}, ${options.shareId ?? null}, 'validate forms', 'React',
      '[]', now() + make_interval(days => ${options.expiresInDays ?? 10}))`);
  await db()
    .execute(sql`insert into report_versions (report_id, version, schema_version, report, source)
    values (${id}, 1, ${options.schemaVersion ?? REPORT_SCHEMA_VERSION}, ${JSON.stringify(report)}::jsonb, 'pipeline')`);
  return id;
}

describe('GET /api/reports/:id', () => {
  it('returns the latest version to the owner', async () => {
    const alice = await signedInUser('alice');
    const id = await insertReport({ userId: alice.id, expiresInDays: 100 });
    await db()
      .execute(sql`insert into report_versions (report_id, version, schema_version, report, source)
      values (${id}, 2, ${REPORT_SCHEMA_VERSION}, '{"need":"version 2"}', 'refresh')`);

    const response = await request(appWith({ accounts: 'on' }))
      .get(`/api/reports/${id}`)
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id,
      shareId: null,
      report: { need: 'version 2' },
      olderFormat: false,
      version: 2,
      versions: [
        { version: 1, source: 'pipeline', createdAt: expect.any(String) },
        { version: 2, source: 'refresh', createdAt: expect.any(String) },
      ],
    });
    expectDaysAhead(response.body.expiresAt, 100);
  });

  it('returns an earlier version when asked for it, and 404 for one it does not have', async () => {
    const alice = await signedInUser('alice');
    const id = await insertReport({ userId: alice.id, shareId: 'link', expiresInDays: 100 });
    await db()
      .execute(sql`insert into report_versions (report_id, version, schema_version, report, source)
      values (${id}, 2, ${REPORT_SCHEMA_VERSION}, '{"need":"version 2"}', 'refresh')`);
    const app = appWith({ accounts: 'on' });
    const get = (query: string) =>
      request(app).get(`/api/reports/${id}${query}`).set('Cookie', alice.cookie);

    const first = await get('?version=1');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ version: 1, report: { need: 'validate forms' } });
    expect(first.body.versions).toHaveLength(2);
    // 3000000000 is beyond Postgres integer, the version column's type.
    for (const query of ['?version=3', '?version=0', '?version=x', '?version=3000000000']) {
      expect((await get(query)).status).toBe(404);
    }
    // The share link always shows the latest.
    expect((await request(app).get('/api/s/link')).body.report).toEqual({ need: 'version 2' });
  });

  it('is 404 for another user, anonymously, and for an anonymous report', async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    const id = await insertReport({ userId: alice.id });
    const anonymousId = await insertReport({});
    const app = appWith({ accounts: 'on' });

    expect((await request(app).get(`/api/reports/${id}`).set('Cookie', bob.cookie)).status).toBe(
      404,
    );
    expect((await request(app).get(`/api/reports/${id}`)).status).toBe(404);
    const anonymous = await request(app)
      .get(`/api/reports/${anonymousId}`)
      .set('Cookie', alice.cookie);
    expect(anonymous.status).toBe(404);
  });

  it('is 404 after the deletion date', async () => {
    const alice = await signedInUser('alice');
    const id = await insertReport({ userId: alice.id, expiresInDays: -1 });

    const response = await request(appWith({ accounts: 'on' }))
      .get(`/api/reports/${id}`)
      .set('Cookie', alice.cookie);
    expect(response.status).toBe(404);
  });

  it('is 404 for an id that is not a uuid', async () => {
    const alice = await signedInUser('alice');
    const response = await request(appWith({ accounts: 'on' }))
      .get('/api/reports/not-a-uuid')
      .set('Cookie', alice.cookie);
    expect(response.status).toBe(404);
  });

  it('does not exist while accounts is off', async () => {
    const id = await insertReport({});
    expect((await request(appWith({ reportLinks: 'on' })).get(`/api/reports/${id}`)).status).toBe(
      404,
    );
  });

  it('opens a report saved with an older schema, marked older', async () => {
    const alice = await signedInUser('alice');
    const id = await insertReport({ userId: alice.id, schemaVersion: 0, report: { old: true } });

    const response = await request(appWith({ accounts: 'on' }))
      .get(`/api/reports/${id}`)
      .set('Cookie', alice.cookie);
    expect(response.body).toMatchObject({ report: { old: true }, olderFormat: true });
  });
});

describe('GET /api/reports', () => {
  it("lists only the user's unexpired reports, latest version first", async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    const older = await insertReport({ userId: alice.id, expiresInDays: 100 });
    const shared = await insertReport({ userId: alice.id, shareId: 'link', expiresInDays: 100 });
    // A refresh a minute later makes the older report the most recently updated.
    await db()
      .execute(sql`insert into report_versions (report_id, version, schema_version, report, source, created_at)
      values (${older}, 2, ${REPORT_SCHEMA_VERSION}, '{}', 'refresh', now() + interval '1 minute')`);
    await insertReport({ userId: alice.id, expiresInDays: -1 });
    await insertReport({ userId: bob.id });
    await insertReport({});

    const response = await request(appWith({ accounts: 'on' }))
      .get('/api/reports')
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: older,
        need: 'validate forms',
        framework: 'React',
        updatedAt: expect.any(String),
        versionCount: 2,
        shared: false,
      },
      {
        id: shared,
        need: 'validate forms',
        framework: 'React',
        updatedAt: expect.any(String),
        versionCount: 1,
        shared: true,
      },
    ]);
    expect(response.body[0].updatedAt > response.body[1].updatedAt).toBe(true);
  });

  it('is 401 without a session', async () => {
    expect((await request(appWith({ accounts: 'on' })).get('/api/reports')).status).toBe(401);
  });

  it('does not exist while accounts is off', async () => {
    const response = await request(appWith({ reportLinks: 'on' })).get('/api/reports');
    expect(response.status).toBe(404);
  });
});

describe('appendVersion', () => {
  it('adds a refresh version, keeps the earlier one, and moves retention to 100 days', async () => {
    const alice = await signedInUser('alice');
    const id = await insertReport({ userId: alice.id, expiresInDays: 3 });
    const report = { need: 'refreshed' } as unknown as Report;

    await appendVersion(id, alice.id, report);

    expect(
      await rows(
        sql`select version, schema_version, source, report from report_versions order by version`,
      ),
    ).toEqual([
      {
        version: 1,
        schema_version: REPORT_SCHEMA_VERSION,
        source: 'pipeline',
        report: { need: 'validate forms', ranking: [] },
      },
      { version: 2, schema_version: REPORT_SCHEMA_VERSION, source: 'refresh', report },
    ]);
    const [{ created_at }] = (await rows(
      sql`select created_at from report_versions where version = 2`,
    )) as { created_at: string }[];
    const { expires_at } = await expiresAtOf(id);
    expect(expires_at.getTime() - new Date(created_at).getTime()).toBe(100 * DAY_MS);
  });
});

describe('POST /api/reports/:id/refresh', () => {
  // A report saved by the pipeline for alice, with the request body's dependencies.
  async function aliceReport(app: ReturnType<typeof appWith>) {
    const alice = await signedInUser('alice');
    const response = await request(app).post('/api/report').set('Cookie', alice.cookie).send(body);
    await vi.waitFor(async () => expect(await rows(sql`select id from ai_usage`)).toHaveLength(2));
    await db().execute(sql`delete from ai_usage`);
    return { alice, id: response.body.saved.id as string };
  }

  const outsideCalls = () => vi.mocked(fetch).mock.calls.length;
  const firstAiCallBody = () =>
    String(
      vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('openrouter'))![1]!.body,
    );

  it('appends version 2 from the saved inputs, which the share link then shows', async () => {
    // Earlier tests leave their events, so count this test's own: the new report adds one.
    const reportEvents = async () =>
      (await rows(sql`select id from events where kind = 'report'`)).length;
    const before = (await reportEvents()) + 1;
    const app = appWith({ accounts: 'on' });
    const { alice, id } = await aliceReport(app);
    await vi.waitFor(async () => expect(await reportEvents()).toBe(before));
    await request(app).post(`/api/reports/${id}/share`).set('Cookie', alice.cookie);
    vi.mocked(fetch).mockClear();

    const response = await request(app)
      .post(`/api/reports/${id}/refresh`)
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, version: 2, olderFormat: false });
    expect(response.body.versions.map((v: { source: string }) => v.source)).toEqual([
      'pipeline',
      'refresh',
    ]);
    expect(firstAiCallBody()).toContain('validate forms');
    expect(firstAiCallBody()).toContain('react');
    expect(firstAiCallBody()).toContain('^19.0.0');
    await vi.waitFor(async () =>
      expect(await rows(sql`select report_id from ai_usage`)).toEqual([
        { report_id: id },
        { report_id: id },
      ]),
    );
    const { shareId } = (await request(app).get(`/api/reports/${id}`).set('Cookie', alice.cookie))
      .body;
    const shared = await request(app).get(`/api/s/${shareId}`);
    expect(shared.body.report.generatedAt).toBe(response.body.report.generatedAt);
    // Refreshes are counted from the account tables, never in the anonymous analytics.
    expect(await reportEvents()).toBe(before);
  });

  it('is 401 without a session, with no outside call', async () => {
    const app = appWith({ accounts: 'on' });
    const { id } = await aliceReport(app);
    vi.mocked(fetch).mockClear();

    expect((await request(app).post(`/api/reports/${id}/refresh`)).status).toBe(401);
    expect(outsideCalls()).toBe(0);
  });

  it("is 404 for another user's, an anonymous or an expired report, with no outside call", async () => {
    const app = appWith({ accounts: 'on' });
    const { id } = await aliceReport(app);
    const bob = await signedInUser('bob');
    const anonymous = await insertReport({});
    const expired = await insertReport({ userId: bob.id, expiresInDays: -1 });
    vi.mocked(fetch).mockClear();

    for (const reportId of [id, anonymous, expired, 'not-a-uuid']) {
      const response = await request(app)
        .post(`/api/reports/${reportId}/refresh`)
        .set('Cookie', bob.cookie);
      expect(response.status).toBe(404);
    }
    expect(outsideCalls()).toBe(0);
  });

  it('shares the hourly limit with new reports, adding no version once it is reached', async () => {
    const app = appWith({ accounts: 'on' });
    const { alice, id } = await aliceReport(app);
    const refresh = () =>
      request(app).post(`/api/reports/${id}/refresh`).set('Cookie', alice.cookie);

    // The report above was the first of 10 this hour.
    for (let i = 0; i < 9; i++) expect((await refresh()).status).toBe(200);
    expect((await refresh()).status).toBe(429);
    expect(await rows(sql`select version from report_versions`)).toHaveLength(10);
  });

  it('is refused at the daily cost cap, with no AI call', async () => {
    const app = appWith({ accounts: 'on' });
    const { alice, id } = await aliceReport(app);
    await db()
      .execute(sql`insert into ai_usage (user_id, source, model, prompt_tokens, completion_tokens, cost, day)
      values (${alice.id}, 'comparison', 'm', 1, 1, 0.25, (now() at time zone 'utc')::date)`);
    vi.mocked(fetch).mockClear();

    const response = await request(app)
      .post(`/api/reports/${id}/refresh`)
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(429);
    expect(outsideCalls()).toBe(0);
  });
});

describe('DELETE /api/reports/:id', () => {
  it('deletes the owner’s report with its versions, and its link stops working', async () => {
    const alice = await signedInUser('alice');
    const id = await insertReport({ userId: alice.id, shareId: 'link', expiresInDays: 100 });
    const app = appWith({ accounts: 'on' });

    const response = await request(app).delete(`/api/reports/${id}`).set('Cookie', alice.cookie);

    expect(response.status).toBe(204);
    expect(await rows(sql`select id from reports`)).toEqual([]);
    expect(await rows(sql`select report_id from report_versions`)).toEqual([]);
    expect((await request(app).get('/api/s/link')).status).toBe(404);
  });

  it('is 404 for another user, an anonymous or expired report, and without a session', async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    const alices = await insertReport({ userId: alice.id });
    const anonymous = await insertReport({});
    const expired = await insertReport({ userId: bob.id, expiresInDays: -1 });
    const app = appWith({ accounts: 'on' });
    const remove = (id: string, cookie?: string) => {
      const call = request(app).delete(`/api/reports/${id}`);
      return cookie ? call.set('Cookie', cookie) : call;
    };

    expect((await remove(alices, bob.cookie)).status).toBe(404);
    expect((await remove(anonymous, bob.cookie)).status).toBe(404);
    expect((await remove(expired, bob.cookie)).status).toBe(404);
    expect((await remove(alices)).status).toBe(404);
    expect(await rows(sql`select id from reports`)).toHaveLength(3);
  });
});

async function expiresAtOf(id: string) {
  const [row] = await rows(sql`select expires_at, created_at from reports where id = ${id}`);
  const { expires_at, created_at } = row as { expires_at: string; created_at: string };
  return { expires_at: new Date(expires_at), created_at: new Date(created_at) };
}

describe('share links', () => {
  it('creates a link for an anonymous report, kept 30 days from its creation', async () => {
    const id = await insertReport({});
    await db().execute(
      sql`update reports set created_at = now() - interval '2 days' where id = ${id}`,
    );
    const app = appWith({ reportLinks: 'on' });

    const response = await request(app).post(`/api/reports/${id}/share`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
    expect(response.body.shareId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(response.body.owned).toBe(false);
    expectDaysAhead(response.body.expiresAt, 28);
    const { expires_at, created_at } = await expiresAtOf(id);
    expect(expires_at.getTime() - created_at.getTime()).toBe(30 * DAY_MS);
  });

  it('returns the same link when asked again', async () => {
    const id = await insertReport({});
    const app = appWith({ reportLinks: 'on' });

    const first = await request(app).post(`/api/reports/${id}/share`);
    const second = await request(app).post(`/api/reports/${id}/share`);

    expect(second.body.shareId).toBe(first.body.shareId);
  });

  it('does not share anonymous reports while report-links is off', async () => {
    const id = await insertReport({});
    const response = await request(appWith({ accounts: 'on' })).post(`/api/reports/${id}/share`);
    expect(response.status).toBe(404);
    expect((await rows(sql`select share_id from reports`))[0]).toEqual({ share_id: null });
  });

  it('is 404 for an expired or unknown report', async () => {
    const id = await insertReport({ expiresInDays: -1 });
    const app = appWith({ reportLinks: 'on' });
    expect((await request(app).post(`/api/reports/${id}/share`)).status).toBe(404);
    expect((await request(app).post(`/api/reports/not-a-uuid/share`)).status).toBe(404);
  });

  it('shares a signed-in report only for its owner, keeping its retention', async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    const id = await insertReport({ userId: alice.id, expiresInDays: 100 });
    const before = await expiresAtOf(id);
    const app = appWith({ accounts: 'on', reportLinks: 'on' });

    expect((await request(app).post(`/api/reports/${id}/share`)).status).toBe(404);
    const other = await request(app).post(`/api/reports/${id}/share`).set('Cookie', bob.cookie);
    expect(other.status).toBe(404);
    expect((await rows(sql`select share_id from reports`))[0]).toEqual({ share_id: null });

    const owner = await request(app).post(`/api/reports/${id}/share`).set('Cookie', alice.cookie);
    expect(owner.status).toBe(200);
    expect(owner.body.owned).toBe(true);
    expect(owner.body.shareId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await expiresAtOf(id)).expires_at).toEqual(before.expires_at);
  });

  it('revokes a link for the owner only, and a new link gets a new id', async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    const id = await insertReport({ userId: alice.id, expiresInDays: 100 });
    const app = appWith({ accounts: 'on' });
    const share = () => request(app).post(`/api/reports/${id}/share`).set('Cookie', alice.cookie);
    const first = (await share()).body.shareId;

    const refused = await request(app).delete(`/api/reports/${id}/share`).set('Cookie', bob.cookie);
    expect(refused.status).toBe(404);
    expect((await rows(sql`select share_id from reports`))[0]).toEqual({ share_id: first });

    const revoked = await request(app)
      .delete(`/api/reports/${id}/share`)
      .set('Cookie', alice.cookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body.shareId).toBeNull();
    expect(revoked.body.owned).toBe(true);
    expect((await rows(sql`select share_id from reports`))[0]).toEqual({ share_id: null });

    const second = (await share()).body.shareId;
    expect(second).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second).not.toBe(first);
  });

  it('does not revoke the link of an anonymous report', async () => {
    const id = await insertReport({ shareId: 'anonymous-link' });
    const app = appWith({ accounts: 'on', reportLinks: 'on' });
    expect((await request(app).delete(`/api/reports/${id}/share`)).status).toBe(404);
    expect((await rows(sql`select share_id from reports`))[0]).toEqual({
      share_id: 'anonymous-link',
    });
  });
});

describe('share pages', () => {
  const privateHeaders = { 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' };

  it('returns the latest version of a shared anonymous report, deletable, with private headers', async () => {
    const id = await insertReport({ shareId: 'link1' });
    await db()
      .execute(sql`insert into report_versions (report_id, version, schema_version, report, source)
      values (${id}, 2, ${REPORT_SCHEMA_VERSION}, '{"need":"version 2"}', 'refresh')`);

    const response = await request(appWith({ reportLinks: 'on' })).get('/api/s/link1');

    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject(privateHeaders);
    expect(response.body).toMatchObject({
      report: { need: 'version 2' },
      deletable: true,
      olderFormat: false,
    });
    expectDaysAhead(response.body.expiresAt, 10);
    expect(response.body).not.toHaveProperty('id');
  });

  it('opens a shared signed-in report without signing in, not deletable', async () => {
    const alice = await signedInUser('alice');
    await insertReport({
      userId: alice.id,
      shareId: 'link2',
      schemaVersion: 0,
      report: { old: 1 },
    });

    const response = await request(appWith({ accounts: 'on' })).get('/api/s/link2');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      report: { old: 1 },
      deletable: false,
      olderFormat: true,
    });
  });

  it('sends the private headers with the app shell of a share page', async () => {
    const response = await request(appWith({ reportLinks: 'on' })).get('/s/link1');
    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject(privateHeaders);
    const home = await request(appWith({ reportLinks: 'on' })).get('/');
    expect(home.headers['x-robots-tag']).toBeUndefined();
  });

  it('is 404 for an unknown, revoked or expired link, and for an unshared report', async () => {
    const alice = await signedInUser('alice');
    await insertReport({ shareId: 'expired', expiresInDays: -1 });
    const unshared = await insertReport({ userId: alice.id });
    const app = appWith({ accounts: 'on', reportLinks: 'on' });
    const share = await request(app)
      .post(`/api/reports/${unshared}/share`)
      .set('Cookie', alice.cookie);
    await request(app).delete(`/api/reports/${unshared}/share`).set('Cookie', alice.cookie);

    for (const shareId of ['unknown', 'expired', share.body.shareId]) {
      const response = await request(app).get(`/api/s/${shareId}`);
      expect(response.status).toBe(404);
      expect(response.headers).toMatchObject(privateHeaders);
    }
  });

  it('deletes an anonymous report and its versions by its link', async () => {
    await insertReport({ shareId: 'link3' });
    const app = appWith({ reportLinks: 'on' });

    expect((await request(app).delete('/api/s/link3')).status).toBe(204);
    expect(await rows(sql`select id from reports`)).toEqual([]);
    expect(await rows(sql`select report_id from report_versions`)).toEqual([]);
    expect((await request(app).get('/api/s/link3')).status).toBe(404);
  });

  it('does not delete a signed-in report by its link', async () => {
    const alice = await signedInUser('alice');
    await insertReport({ userId: alice.id, shareId: 'link4' });
    const app = appWith({ accounts: 'on', reportLinks: 'on' });

    expect((await request(app).delete('/api/s/link4')).status).toBe(404);
    expect(await rows(sql`select share_id from reports`)).toEqual([{ share_id: 'link4' }]);
  });

  it('does not open anonymous links while report-links is off', async () => {
    await insertReport({ shareId: 'link6' });
    const response = await request(appWith({ accounts: 'on' })).get('/api/s/link6');
    expect(response.status).toBe(404);
  });

  it('has no share pages while both flags are off', async () => {
    await insertReport({ shareId: 'link5' });
    const app = appWith({});
    expect((await request(app).get('/api/s/link5')).status).toBe(404);
    expect((await request(app).delete('/api/s/link5')).status).toBe(404);
    expect(await rows(sql`select share_id from reports`)).toEqual([{ share_id: 'link5' }]);
  });
});

describe('cleanup', () => {
  it('deletes expired reports with their versions, and only those', async () => {
    const expired = await insertReport({ expiresInDays: -1 });
    const current = await insertReport({ expiresInDays: 1 });

    expect(await deleteExpiredReports()).toBe(1);

    expect(await rows(sql`select id from reports`)).toEqual([{ id: current }]);
    expect(await rows(sql`select report_id from report_versions`)).toEqual([
      { report_id: current },
    ]);
    expect(expired).not.toBe(current);
  });
});

describe('report ids in traces and logs', () => {
  // The request span of the last request, and the log messages printed so far.
  async function requestSpan(requests: number) {
    const server = (await finishedSpans(spans, requests)).filter((s) => s.kind === SpanKind.SERVER);
    return server.at(-1)!;
  }
  const messages = (consoleLog: { mock: { calls: unknown[][] } }) =>
    consoleLog.mock.calls.map(
      ([line]) => (JSON.parse(String(line)) as { message: string }).message,
    );

  it('puts the id of a saved report on its request span and in a log line', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await request(appWith({ reportLinks: 'on' }))
      .post('/api/report')
      .send(body);
    const id = response.body.saved.id as string;

    expect((await requestSpan(1)).attributes['report.id']).toBe(id);
    expect(messages(consoleLog)).toContain(`report saved: ${id}`);
  });

  it('puts the id of a refreshed report on its request span, and no user id in any span', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = appWith({ accounts: 'on' });
    const alice = await signedInUser('alice');
    const { id } = (await request(app).post('/api/report').set('Cookie', alice.cookie).send(body))
      .body.saved as { id: string };
    await request(app).post(`/api/reports/${id}/refresh`).set('Cookie', alice.cookie);

    expect((await requestSpan(2)).attributes['report.id']).toBe(id);
    expect(messages(consoleLog).filter((m) => m === `report saved: ${id}`)).toHaveLength(2);
    const recorded = JSON.stringify(
      spans.getFinishedSpans().map((s) => [s.name, s.attributes, s.events, s.status]),
    );
    expect(recorded).not.toContain(alice.id);
  });

  it('puts no report id on the span of a report that is not saved', async () => {
    await request(appWith({})).post('/api/report').send(body);

    expect((await requestSpan(1)).attributes).not.toHaveProperty('report.id');
  });
});
