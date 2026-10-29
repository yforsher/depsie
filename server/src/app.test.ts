import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { claim, comparison, sourceResponse, usage } from './fixtures.js';

// Each analytics write is captured as its values, in the column order of sql/schema.sql:
// kind, visitor, country, framework, status, prompt_tokens, completion_tokens, cost.
const db = vi.hoisted(() => ({ inserts: [] as unknown[][], fail: false }));
vi.mock('@neondatabase/serverless', () => ({
  neon:
    () =>
    async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      if (db.fail) throw new Error('database unreachable');
      db.inserts.push(values);
      return [];
    },
}));

const clientDir = mkdtempSync(join(tmpdir(), 'client-dist-'));
writeFileSync(join(clientDir, 'index.html'), '<div id="root"></div>');
writeFileSync(join(clientDir, 'app.js'), 'console.log("app")');

const app = createApp(clientDir);

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('client files', () => {
  it('serves index.html for /', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('<div id="root"></div>');
  });

  it('serves index.html for unknown client routes', async () => {
    const response = await request(app).get('/some/client/route');

    expect(response.status).toBe(200);
    expect(response.text).toBe('<div id="root"></div>');
  });

  it('serves static assets', async () => {
    const response = await request(app).get('/app.js');

    expect(response.status).toBe(200);
    expect(response.text).toBe('console.log("app")');
  });

  it('returns 404 for unknown API routes', async () => {
    const response = await request(app).get('/api/unknown');

    expect(response.status).toBe(404);
  });
});

const reportBody = { need: 'validate forms', framework: 'React' };
const expansion = { keywords: [], packages: ['@hookform/resolvers'] };

// AI call 1 gets the expansion and AI call 2 the given answer; npm /latest resolves the
// fixture package and every other source is served from the fixtures.
function mockPipeline(answer: unknown = comparison(), openRouterStatus = 200) {
  // Alternates between the two answers so one mock serves several requests.
  let aiCall = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('https://openrouter.ai')) {
      const content = JSON.stringify([expansion, answer][aiCall++ % 2]);
      return Response.json(
        { provider: 'DeepInfra', choices: [{ message: { content } }], usage },
        { status: openRouterStatus },
      );
    }
    if (url.endsWith('/latest')) {
      return Response.json({ name: '@hookform/resolvers', version: '6.0.0' });
    }
    return sourceResponse(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function aiCalls(fetchMock: ReturnType<typeof mockPipeline>) {
  return fetchMock.mock.calls.filter(([url]) => url.startsWith('https://openrouter.ai')).length;
}

afterEach(() => {
  db.inserts = [];
  db.fail = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/report', () => {
  it('generates a report with exactly two AI calls', async () => {
    const fetchMock = mockPipeline();
    const response = await request(createApp(clientDir)).post('/api/report').send(reportBody);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      need: 'validate forms',
      framework: 'React',
      ranking: [{ rank: 1, name: '@hookform/resolvers', version: '6.0.0' }],
    });
    expect(aiCalls(fetchMock)).toBe(2);
  });

  it('fetches everything again for each request, since nothing is stored', async () => {
    const fetchMock = mockPipeline();
    const app = createApp(clientDir);
    await request(app).post('/api/report').send(reportBody);
    const callsPerReport = fetchMock.mock.calls.length;
    await request(app).post('/api/report').send(reportBody);

    expect(fetchMock.mock.calls.length).toBe(2 * callsPerReport);
  });

  it('rejects an invalid body with 400 and no AI call', async () => {
    const fetchMock = mockPipeline();
    const response = await request(createApp(clientDir))
      .post('/api/report')
      .send({ need: '', framework: 'React' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('need');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized input with 400', async () => {
    mockPipeline();
    const response = await request(createApp(clientDir))
      .post('/api/report')
      .send({ ...reportBody, need: 'x'.repeat(501) });
    expect(response.status).toBe(400);
  });

  it('returns 502 without a retry when the model cites a field that was not fetched', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const answer = comparison({
      ranking: [{ name: '@hookform/resolvers', pros: [claim('npm.stars')], cons: [] }],
    });
    const fetchMock = mockPipeline(answer);
    const response = await request(createApp(clientDir)).post('/api/report').send(reportBody);

    expect(response.status).toBe(502);
    expect(response.body.error).toContain('not fetched: field @hookform/resolvers npm.stars');
    expect(aiCalls(fetchMock)).toBe(2);
    const logged = consoleError.mock.calls.map(([line]) => String(line));
    const output = logged.find((line) => line.startsWith('Rejected model output: '));
    expect(JSON.parse(output!.slice('Rejected model output: '.length))).toEqual(answer);
  });

  it('returns 502 when OpenRouter fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = mockPipeline(comparison(), 500);
    const response = await request(createApp(clientDir)).post('/api/report').send(reportBody);

    expect(response.status).toBe(502);
    expect(response.body.error).toMatch(/OpenRouter request failed with status 500/);
    expect(aiCalls(fetchMock)).toBe(1);
    // There is no model output to log, only the failed step.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('returns 429 after 10 requests in an hour', async () => {
    mockPipeline();
    const app = createApp(clientDir);
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/report').send({});
    }
    const response = await request(app).post('/api/report').send(reportBody);

    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/limit is 10 per hour/);
  });
});

// Log lines as printed, with the request ID split off.
function logLines() {
  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () =>
    consoleLog.mock.calls.map(([line]) => {
      const [, id, text] = /^\[(\w+)\] (.*)$/s.exec(String(line))!;
      return { id, text };
    });
}

describe('POST /api/report logging', () => {
  it('logs each step once with the same request ID', async () => {
    const lines = logLines();
    mockPipeline();
    await request(createApp(clientDir)).post('/api/report').send(reportBody);

    const logged = lines();
    expect(logged.map((l) => l.text)).toEqual([
      'request received: framework React, 0 dependencies',
      expect.stringMatching(
        /^query_expansion done in \d+\.\ds by DeepInfra: 166 prompt \+ 267 completion tokens, \$0\.00005$/,
      ),
      expect.stringMatching(/^data fetched for 1 candidates in \d+\.\ds; failed sources: none$/),
      expect.stringMatching(/^comparison done in /),
      expect.stringMatching(/^response sent: 200 in \d+\.\ds$/),
    ]);
    expect(new Set(logged.map((l) => l.id)).size).toBe(1);
  });

  it('gives each request its own ID', async () => {
    const lines = logLines();
    mockPipeline();
    const app = createApp(clientDir);
    await request(app).post('/api/report').send(reportBody);
    await request(app).post('/api/report').send(reportBody);

    expect(new Set(lines().map((l) => l.id)).size).toBe(2);
  });

  it('logs the failed step and the reason in one line', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const lines = logLines();
    mockPipeline(
      comparison({
        ranking: [{ name: '@hookform/resolvers', pros: [claim('npm.stars')], cons: [] }],
      }),
    );
    await request(createApp(clientDir)).post('/api/report').send(reportBody);

    expect(lines().map((l) => l.text)).toContain(
      'comparison failed: Model cited data that was not fetched: field @hookform/resolvers npm.stars',
    );
  });

  it('logs invalid input and rate limits in one line each', async () => {
    const lines = logLines();
    mockPipeline();
    const app = createApp(clientDir);
    for (let i = 0; i < 11; i++) {
      await request(app).post('/api/report').send({ need: '', framework: 'React' });
    }

    const texts = lines().map((l) => l.text);
    expect(texts.filter((t) => t.startsWith('invalid input: '))).toHaveLength(10);
    expect(texts.filter((t) => t === 'rate limited')).toHaveLength(1);
  });

  it('never logs the need text or dependency names', async () => {
    const lines = logLines();
    mockPipeline();
    const need = 'a secret internal need';
    await request(createApp(clientDir))
      .post('/api/report')
      .send({
        need,
        framework: 'React',
        dependencies: [{ name: 'private-dep-name', range: '^1.0.0' }],
      });

    const output = lines()
      .map((l) => l.text)
      .join('\n');
    expect(output).toContain('1 dependencies');
    expect(output).not.toContain(need);
    expect(output).not.toContain('private-dep-name');
  });
});

describe('analytics', () => {
  const visitor = expect.stringMatching(/^[0-9a-f]{16}$/);

  it('records a report with only the allowed fields and the usage of both AI calls', async () => {
    mockPipeline();
    await request(createApp(clientDir)).post('/api/report').send(reportBody);

    await vi.waitFor(() => expect(db.inserts).toHaveLength(1));
    // Supertest connects from localhost, which has no country.
    expect(db.inserts[0]).toEqual([
      'report',
      visitor,
      null,
      'React',
      200,
      2 * usage.prompt_tokens,
      2 * usage.completion_tokens,
      2 * usage.cost,
    ]);
  });

  it('never records the need text or dependency names', async () => {
    mockPipeline();
    const need = 'a secret internal need';
    await request(createApp(clientDir))
      .post('/api/report')
      .send({ ...reportBody, need, dependencies: [{ name: 'private-dep-name', range: '^1.0.0' }] });

    await vi.waitFor(() => expect(db.inserts).toHaveLength(1));
    const recorded = JSON.stringify(db.inserts);
    expect(recorded).not.toContain(need);
    expect(recorded).not.toContain('private-dep-name');
  });

  it('records rejected requests with their status and no framework or usage', async () => {
    mockPipeline();
    await request(createApp(clientDir)).post('/api/report').send({ need: '', framework: 'React' });

    await vi.waitFor(() => expect(db.inserts).toHaveLength(1));
    expect(db.inserts[0]).toEqual(['report', visitor, null, null, 400, 0, 0, 0]);
  });

  it('records a visit when the app shell is served, not for assets', async () => {
    const app = createApp(clientDir);
    await request(app).get('/');
    await request(app).get('/app.js');

    await vi.waitFor(() => expect(db.inserts).toHaveLength(1));
    expect(db.inserts[0]).toEqual(['visit', visitor, null, null, null, null, null, null]);
  });

  it('gives the same visitor the same hash within a day', async () => {
    const app = createApp(clientDir);
    await request(app).get('/');
    await request(app).get('/');

    await vi.waitFor(() => expect(db.inserts).toHaveLength(2));
    expect(db.inserts[0]![1]).toBe(db.inserts[1]![1]);
  });

  it('logs a failed write without affecting the response', async () => {
    const lines = logLines();
    db.fail = true;
    const response = await request(createApp(clientDir)).get('/');

    expect(response.status).toBe(200);
    await vi.waitFor(() =>
      expect(lines()).toContainEqual({
        id: 'analytics',
        text: 'analytics failed: database unreachable',
      }),
    );
  });
});
