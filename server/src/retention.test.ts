import { expect, it } from 'vitest';
import { expiresAt } from './retention.js';

const created = new Date('2026-11-01T10:00:00Z');
const latestVersion = new Date('2026-11-20T08:00:00Z');

it('keeps an anonymous report 10 days from its creation', () => {
  expect(expiresAt({ userId: null, shareId: null, createdAt: created, latestVersion })).toEqual(
    new Date('2026-11-11T10:00:00Z'),
  );
});

it('keeps an anonymous report with a link 30 days from its creation, not from now', () => {
  expect(expiresAt({ userId: null, shareId: 's', createdAt: created, latestVersion })).toEqual(
    new Date('2026-12-01T10:00:00Z'),
  );
});

it('keeps a signed-in report 100 days from its latest version', () => {
  expect(expiresAt({ userId: 'u1', shareId: 's', createdAt: created, latestVersion })).toEqual(
    new Date('2027-02-28T08:00:00Z'),
  );
});
