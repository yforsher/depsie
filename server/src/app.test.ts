import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { claim, comparison, sourceResponse } from './fixtures.js';

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
      return Response.json({ choices: [{ message: { content } }] }, { status: openRouterStatus });
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
  vi.unstubAllGlobals();
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
    const fetchMock = mockPipeline(
      comparison({ ranking: [{ name: '@hookform/resolvers', reasons: [claim('npm.stars')] }] }),
    );
    const response = await request(createApp(clientDir)).post('/api/report').send(reportBody);

    expect(response.status).toBe(502);
    expect(response.body.error).toContain('not fetched: @hookform/resolvers npm.stars');
    expect(aiCalls(fetchMock)).toBe(2);
  });

  it('returns 502 when OpenRouter fails', async () => {
    const fetchMock = mockPipeline(comparison(), 500);
    const response = await request(createApp(clientDir)).post('/api/report').send(reportBody);

    expect(response.status).toBe(502);
    expect(response.body.error).toMatch(/OpenRouter request failed with status 500/);
    expect(aiCalls(fetchMock)).toBe(1);
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
