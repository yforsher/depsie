import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import type { Auth } from './auth.js';
import { loadUser } from './users.js';

it('answers 503 with a clear message when the session cannot be read', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // The session lookup is a database query, so this is what a database outage looks like here.
  const auth = {
    api: {
      getSession: async () => {
        throw new Error('Failed to get session');
      },
    },
  } as unknown as Auth;
  const app = express().get('/', loadUser(auth), (_req, res) => res.json({ ok: true }));

  const response = await request(app).get('/').set('Cookie', 'better-auth.session_token=x');

  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'Reports are unavailable right now.' });
});
