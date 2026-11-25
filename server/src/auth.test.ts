import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { signedInUser } from './testUsers.js';
import { db, openDatabase } from './db/client.js';
import { fakeFetch } from './fixtureResponses.js';

const origin = 'http://localhost:3000';
const clientDir = mkdtempSync(join(tmpdir(), 'client-dist-'));
writeFileSync(join(clientDir, 'index.html'), '<div id="root"></div>');

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'memory');
  vi.stubEnv('FEATURE_ACCOUNTS', 'on');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('GITHUB_CLIENT_ID', 'client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'client-secret');
  await openDatabase();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await db().execute(sql`delete from "user"`);
  await db().execute(sql`delete from ai_usage`);
});

// GitHub's token endpoint, profile and emails, answered like the real API.
function stubGitHub(profile = { login: 'alice', name: 'Alice' }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://github.com/login/oauth/access_token')) {
        return Response.json({
          access_token: 'gho_secret',
          token_type: 'bearer',
          scope: 'user:email',
        });
      }
      if (url === 'https://api.github.com/user/emails') {
        return Response.json([
          { email: 'alice@users.noreply.github.com', primary: false, verified: true },
          { email: 'alice@example.com', primary: true, verified: true },
        ]);
      }
      if (url === 'https://api.github.com/user') {
        return Response.json({
          id: 42,
          login: profile.login,
          name: profile.name,
          avatar_url: 'https://avatars.example/a.png',
          email: null,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

async function signInWithGitHub() {
  const agent = request.agent(createApp(clientDir));
  const start = await agent
    .post('/api/auth/sign-in/social')
    .set('Origin', origin)
    .send({ provider: 'github', callbackURL: '/' });
  const authorize = new URL(start.body.url);
  // From a client IP and a browser, as on Cloud Run, so the test sees what a real sign-in stores.
  const callback = await agent
    .get(`/api/auth/callback/github?code=code&state=${authorize.searchParams.get('state')}`)
    .set('X-Forwarded-For', '203.0.113.7')
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0)');
  return { authorize, callback };
}

describe('GET /api/me', () => {
  // 200 with null, not 401: browsers log every 4xx answer as a console error.
  it('returns no user without a session', async () => {
    const response = await request(createApp(clientDir)).get('/api/me');

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it('returns the signed-in user', async () => {
    const { id, cookie } = await signedInUser();
    const response = await request(createApp(clientDir)).get('/api/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id,
      name: 'Alice',
      login: 'alice',
      image: 'https://avatars.example/a.png',
      email: 'alice@example.com',
    });
  });
});

describe('session renewal', () => {
  // Better Auth extends a session that is more than a day old when it is read; the browser must get
  // the renewed cookie too, or an active user is signed out 7 days after signing in.
  it('sends the renewed session cookie when an active session is extended', async () => {
    const { cookie } = await signedInUser();
    await db().execute(sql`update session set expires_at = now() + interval '5 days'`);

    const response = await request(createApp(clientDir)).get('/api/me').set('Cookie', cookie);

    const setCookies = [response.headers['set-cookie']].flat();
    expect(setCookies.some((c) => c?.includes('session_token='))).toBe(true);
    const sessions = await db().execute(
      sql`select expires_at > now() + interval '6 days' as extended from session`,
    );
    expect(sessions.rows).toEqual([{ extended: true }]);
  });
});

describe('sign-out', () => {
  it('ends the session', async () => {
    const { cookie } = await signedInUser();
    const app = createApp(clientDir);
    await request(app).post('/api/auth/sign-out').set('Cookie', cookie).set('Origin', origin);

    expect((await request(app).get('/api/me').set('Cookie', cookie)).body).toBeNull();
  });
});

describe('sign-in with GitHub', () => {
  it('asks only for read access to the email addresses', async () => {
    stubGitHub();
    const { authorize } = await signInWithGitHub();

    expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(authorize.searchParams.get('scope')).toBe('user:email');
  });

  it('stores the profile and verified primary email, and never the GitHub token', async () => {
    stubGitHub();
    await signInWithGitHub();
    const { callback } = await signInWithGitHub();

    expect(callback.status).toBe(302);
    const users = await db().execute(sql`select name, email, image, github_login from "user"`);
    expect(users.rows).toEqual([
      {
        name: 'Alice',
        email: 'alice@example.com',
        image: 'https://avatars.example/a.png',
        github_login: 'alice',
      },
    ]);
    const accounts = await db().execute(
      sql`select account_id, access_token, refresh_token, id_token from account`,
    );
    expect(accounts.rows).toEqual([
      { account_id: '42', access_token: null, refresh_token: null, id_token: null },
    ]);
  });

  it('stores no IP address or browser for the session', async () => {
    stubGitHub();
    await signInWithGitHub();

    const sessions = await db().execute(sql`select ip_address, user_agent from session`);
    expect(sessions.rows).toEqual([{ ip_address: null, user_agent: null }]);
  });

  it('refreshes the stored profile at each sign-in, so a GitHub rename is picked up', async () => {
    stubGitHub();
    await signInWithGitHub();
    stubGitHub({ login: 'alice-renamed', name: 'Alice Renamed' });
    await signInWithGitHub();

    const users = await db().execute(sql`select name, github_login from "user"`);
    expect(users.rows).toEqual([{ name: 'Alice Renamed', github_login: 'alice-renamed' }]);
  });

  it('sets the session in an httpOnly, SameSite=Lax cookie', async () => {
    stubGitHub();
    const { callback } = await signInWithGitHub();

    const session = [callback.headers['set-cookie']]
      .flat()
      .find((cookie) => cookie?.includes('session_token='));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });
});

describe('delete account', () => {
  async function addUsage(userId: string) {
    await db().execute(
      sql`insert into ai_usage (user_id, source, model, prompt_tokens, completion_tokens, cost)
          values (${userId}, 'comparison', 'm', 1, 1, 0.001)`,
    );
  }

  async function count(table: string, userId: string) {
    const column = table === 'user' ? 'id' : 'user_id';
    const result = await db().execute(
      sql.raw(`select count(*)::int as n from "${table}" where ${column} = '${userId}'`),
    );
    return (result.rows[0] as { n: number }).n;
  }

  it("removes the user and every row of theirs, keeps other users' rows, and ends the session", async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    await addUsage(alice.id);
    await addUsage(bob.id);
    const app = createApp(clientDir);

    const response = await request(app)
      .post('/api/auth/delete-user')
      .set('Cookie', alice.cookie)
      .set('Origin', origin)
      .send({});

    expect(response.status).toBe(200);
    for (const table of ['user', 'session', 'ai_usage']) {
      expect(await count(table, alice.id)).toBe(0);
      expect(await count(table, bob.id)).toBe(1);
    }
    expect((await request(app).get('/api/me').set('Cookie', alice.cookie)).body).toBeNull();
    expect((await request(app).get('/api/me').set('Cookie', bob.cookie)).status).toBe(200);
  });
});

describe('limits for signed-in users', () => {
  const invalid = { need: '', framework: 'React' };
  const valid = { need: 'validate forms', framework: 'React' };

  // `count` reports run today by the user, or anonymously: one query expansion call each.
  async function reportsRun(userId: string | null, count: number) {
    await db().execute(
      sql`insert into ai_usage (user_id, source, model, prompt_tokens, completion_tokens, cost)
          select ${userId}, 'query_expansion', 'm', 1, 1, 0.001 from generate_series(1, ${count})`,
    );
  }

  it('counts reports per user, so two users on one IP get 10 each', async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    const app = createApp(clientDir);
    const post = (cookie: string) =>
      request(app).post('/api/report').set('Cookie', cookie).send(invalid);

    for (let i = 0; i < 10; i++) {
      expect((await post(alice.cookie)).status).toBe(400);
      expect((await post(bob.cookie)).status).toBe(400);
    }
    expect((await post(alice.cookie)).status).toBe(429);
  });

  it('does not count signed-in users toward the per-IP daily limit of anonymous reports', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const alice = await signedInUser('alice');
    const app = createApp(clientDir);
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/api/report').send(invalid)).status).toBe(400);
    }
    // Past the hourly window: the IP has used its anonymous reports for the day.
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect((await request(app).post('/api/report').send(invalid)).status).toBe(429);

    const response = await request(app)
      .post('/api/report')
      .set('Cookie', alice.cookie)
      .send(invalid);
    expect(response.status).toBe(400);
  });

  it('refuses a user who has run 10 reports today, without blocking other users', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    await reportsRun(alice.id, 10);
    await reportsRun(bob.id, 9);
    await reportsRun(null, 400);
    const app = createApp(clientDir);

    const refused = await request(app).post('/api/report').set('Cookie', alice.cookie).send(valid);
    expect(refused.status).toBe(429);
    expect(refused.body.error).toContain('daily');
    const allowed = await request(app).post('/api/report').set('Cookie', bob.cookie).send(valid);
    expect(allowed.status).toBe(200);
  });

  it("records a signed-in user's AI calls with their user", async () => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    const alice = await signedInUser('alice');
    await request(createApp(clientDir)).post('/api/report').set('Cookie', alice.cookie).send(valid);

    await vi.waitFor(async () => {
      const rows = await db().execute(sql`select user_id, source from ai_usage order by id`);
      expect(rows.rows).toEqual([
        { user_id: alice.id, source: 'query_expansion' },
        { user_id: alice.id, source: 'comparison' },
      ]);
    });
  });
});

describe('GET /api/usage', () => {
  // The UTC day `daysAgo` days before today, as ai_usage stores it.
  const utcDay = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  async function call(userId: string | null, source: string, daysAgo: number, cost: number) {
    await db().execute(
      sql`insert into ai_usage (user_id, source, model, prompt_tokens, completion_tokens, cost, day)
          values (${userId}, ${source}, 'm', 100, 50, ${cost}, ${utcDay(daysAgo)})`,
    );
  }

  it("returns the user's reports and tokens per day, newest first, with today's reports and the cap, and no cost", async () => {
    const alice = await signedInUser('alice');
    const bob = await signedInUser('bob');
    // Today one report, yesterday two (each a query expansion and a comparison).
    await call(alice.id, 'query_expansion', 0, 0.001);
    await call(alice.id, 'comparison', 0, 0.002);
    for (let i = 0; i < 2; i++) {
      await call(alice.id, 'query_expansion', 1, 0.001);
      await call(alice.id, 'comparison', 1, 0.002);
    }
    // Not counted: another user, anonymous use, and a day older than 30 days.
    await call(bob.id, 'query_expansion', 0, 0.1);
    await call(null, 'query_expansion', 0, 0.1);
    await call(alice.id, 'query_expansion', 30, 0.1);

    const response = await request(createApp(clientDir))
      .get('/api/usage')
      .set('Cookie', alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [
        { day: utcDay(0), reports: 1, tokens: 300 },
        { day: utcDay(1), reports: 2, tokens: 600 },
      ],
      todayReports: 1,
      dailyCap: 10,
    });
  });

  it('returns no days and no reports today for a user without usage', async () => {
    const alice = await signedInUser('alice');
    const response = await request(createApp(clientDir))
      .get('/api/usage')
      .set('Cookie', alice.cookie);

    expect(response.body).toEqual({ days: [], todayReports: 0, dailyCap: 10 });
  });

  it('is 401 without a session', async () => {
    expect((await request(createApp(clientDir)).get('/api/usage')).status).toBe(401);
  });

  it('is 404 while accounts is off, or not on for the caller', async () => {
    const alice = await signedInUser('alice');
    vi.stubEnv('FEATURE_ACCOUNTS', 'bob');
    const listed = await request(createApp(clientDir))
      .get('/api/usage')
      .set('Cookie', alice.cookie);
    vi.stubEnv('FEATURE_ACCOUNTS', '');
    const off = await request(createApp(clientDir)).get('/api/usage').set('Cookie', alice.cookie);
    vi.stubEnv('FEATURE_ACCOUNTS', 'on');

    expect(listed.status).toBe(404);
    expect(off.status).toBe(404);
  });
});

describe('the accounts flag', () => {
  afterEach(() => {
    vi.stubEnv('FEATURE_ACCOUNTS', 'on');
  });

  it('removes the sign-in and account routes while it is off', async () => {
    vi.stubEnv('FEATURE_ACCOUNTS', '');
    const app = createApp(clientDir);

    expect((await request(app).get('/api/me')).status).toBe(404);
    expect((await request(app).get('/api/auth/ok')).status).toBe(404);
    expect((await request(app).get('/api/features')).body).toEqual({
      enabled: [],
      signIn: false,
    });
  });

  it('works only for listed logins while it is a list', async () => {
    const alice = await signedInUser('alice');
    const mallory = await signedInUser('mallory');
    vi.stubEnv('FEATURE_ACCOUNTS', 'Alice,bob');
    const app = createApp(clientDir);

    expect((await request(app).get('/api/me').set('Cookie', alice.cookie)).status).toBe(200);
    expect((await request(app).get('/api/me').set('Cookie', mallory.cookie)).status).toBe(404);
    expect((await request(app).get('/api/me')).status).toBe(404);
  });

  it('lists accounts only for a listed user, and reports that sign-in is possible', async () => {
    const alice = await signedInUser('alice');
    vi.stubEnv('FEATURE_ACCOUNTS', 'alice');
    const app = createApp(clientDir);

    const listed = await request(app).get('/api/features').set('Cookie', alice.cookie);
    expect(listed.body).toEqual({ enabled: ['accounts'], signIn: true });
    const anonymous = await request(app).get('/api/features');
    expect(anonymous.body).toEqual({ enabled: [], signIn: true });
  });

  it('refuses sign-in for a login that is not listed, creating no user and no session', async () => {
    vi.stubEnv('FEATURE_ACCOUNTS', 'bob');
    stubGitHub();
    const { callback } = await signInWithGitHub();

    expect(callback.status).toBe(302);
    expect((await db().execute(sql`select id from "user"`)).rows).toEqual([]);
    expect((await db().execute(sql`select id from session`)).rows).toEqual([]);
  });
});
