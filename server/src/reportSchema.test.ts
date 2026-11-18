import { REPORT_SCHEMA_VERSION } from 'shared';
import { expect, it } from 'vitest';
import { toCurrentSchema } from './reportSchema.js';

const mockReport = { need: 'validate forms', ranking: [] };

it('returns a report saved with the current schema unchanged', () => {
  expect(toCurrentSchema(REPORT_SCHEMA_VERSION, mockReport)).toEqual({
    report: mockReport,
    olderFormat: false,
  });
});

it('returns a report from a schema with no conversion as saved, marked older', () => {
  const saved = { need: 'old shape' };
  expect(toCurrentSchema(0, saved)).toEqual({ report: saved, olderFormat: true });
});
