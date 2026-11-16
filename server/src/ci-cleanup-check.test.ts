import { expect, it } from 'vitest';

// Temporary: fails on purpose to prove the CI db job deletes its Neon branch on failure.
it('fails on purpose', () => {
  expect(1).toBe(2);
});
