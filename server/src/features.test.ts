import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { enabledFor, readFlags } from './features.js';

describe('readFlags', () => {
  it('turns on a flag whose variable is on', () => {
    expect(readFlags({ FEATURE_ACCOUNTS: 'on' })).toEqual({
      accounts: true,
      'report-links': false,
    });
  });

  it('maps dashes in the flag name to underscores', () => {
    expect(readFlags({ FEATURE_REPORT_LINKS: 'on' })['report-links']).toBe(true);
  });

  it('leaves a flag off when its variable is unset or empty', () => {
    expect(readFlags({ FEATURE_ACCOUNTS: '' })).toEqual({ accounts: false, 'report-links': false });
  });

  // Not a list with the GitHub user "off": that would turn sign-in on for that account.
  it('turns accounts off with off', () => {
    expect(readFlags({ FEATURE_ACCOUNTS: 'off' }).accounts).toBe(false);
  });

  it('leaves report-links off for any value other than on', () => {
    expect(readFlags({ FEATURE_REPORT_LINKS: 'true' })['report-links']).toBe(false);
  });

  // Intended change: any other value of FEATURE_ACCOUNTS (true included) is now a login list.
  it('reads any other accounts value as a list of logins, lower case', () => {
    expect(readFlags({ FEATURE_ACCOUNTS: 'alice, Bob' }).accounts).toEqual(['alice', 'bob']);
    expect(readFlags({ FEATURE_ACCOUNTS: 'true' }).accounts).toEqual(['true']);
  });
});

describe('enabledFor', () => {
  const flags = readFlags({ FEATURE_ACCOUNTS: 'alice,Bob', FEATURE_REPORT_LINKS: 'on' });

  it('turns a login list on only for a listed login, without regard to case', () => {
    expect(enabledFor(flags, 'BOB')).toEqual(['report-links', 'accounts']);
    expect(enabledFor(flags, 'mallory')).toEqual(['report-links']);
  });

  it('leaves a login list off when nobody is signed in', () => {
    expect(enabledFor(flags)).toEqual(['report-links']);
  });

  it('lists a flag that is on for everyone', () => {
    expect(enabledFor(readFlags({ FEATURE_ACCOUNTS: 'on' }))).toEqual(['accounts']);
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
    expect(response.body).toEqual({ enabled: ['accounts'], signIn: true });
  });

  it('lists no flags when none is on', async () => {
    vi.stubEnv('FEATURE_ACCOUNTS', '');
    vi.stubEnv('FEATURE_REPORT_LINKS', '');

    const response = await request(createApp('client-dist')).get('/api/features');

    expect(response.body).toEqual({ enabled: [], signIn: false });
  });
});
