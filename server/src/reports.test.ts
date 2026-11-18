import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { REPORT_SCHEMA_VERSION } from 'shared';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { deleteExpiredReports } from './cleanup.js';
import { db, openDatabase } from './db/client.js';
import { fakeFetch } from './fixtureResponses.js';
import { signedInUser } from './testUsers.js';

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
    });
    expectDaysAhead(response.body.expiresAt, 100);
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
