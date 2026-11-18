import { type Report, REPORT_SCHEMA_VERSION } from 'shared';

// Converters from a stored schema version to the next one, keyed by the version they read. None yet:
// add one whenever REPORT_SCHEMA_VERSION goes up.
const converters: Record<number, (report: unknown) => unknown> = {};

// A stored report in the current schema, or as saved with olderFormat when no conversion path
// exists, so an old report still opens (read-only) instead of failing.
export function toCurrentSchema(schemaVersion: number, stored: unknown) {
  let report = stored;
  for (let version = schemaVersion; version < REPORT_SCHEMA_VERSION; version++) {
    const convert = converters[version];
    if (!convert) return { report: stored as Report, olderFormat: true };
    report = convert(report);
  }
  return { report: report as Report, olderFormat: false };
}
