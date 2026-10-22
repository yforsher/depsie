import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

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
