import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { enabledFeatures } from './features.js';

describe('enabledFeatures', () => {
  it('turns on a flag whose variable is on', () => {
    expect(enabledFeatures({ FEATURE_ACCOUNTS: 'on' })).toEqual(['accounts']);
  });

  it('maps dashes in the flag name to underscores', () => {
    expect(enabledFeatures({ FEATURE_REPORT_LINKS: 'on' })).toEqual(['report-links']);
  });

  it('leaves a flag off when its variable is unset', () => {
    expect(enabledFeatures({})).toEqual([]);
  });

  it('leaves a flag off for any value other than on', () => {
    expect(enabledFeatures({ FEATURE_ACCOUNTS: 'true', FEATURE_REPORT_LINKS: 'ON' })).toEqual([]);
  });
});

describe('GET /api/features', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Flags are read when the app is created, so each test builds its own app.
  it('lists the flags that are on', async () => {
    vi.stubEnv('FEATURE_ACCOUNTS', 'on');
    vi.stubEnv('FEATURE_REPORT_LINKS', 'off');

    const response = await request(createApp('client-dist')).get('/api/features');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: ['accounts'] });
  });

  it('lists no flags when none is on', async () => {
    vi.stubEnv('FEATURE_ACCOUNTS', '');
    vi.stubEnv('FEATURE_REPORT_LINKS', '');

    const response = await request(createApp('client-dist')).get('/api/features');

    expect(response.body).toEqual({ enabled: [] });
  });
});
