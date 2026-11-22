import { trace } from '@opentelemetry/api';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { log } from './log.js';
import { startTracing } from './tracing.js';

beforeAll(() => startTracing([]));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function printed(write: () => void) {
  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  write();
  return consoleLog.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
}

const inSpan = (fn: (traceId: string, spanId: string) => void) =>
  trace.getTracer('test').startActiveSpan('test', (span) => {
    fn(span.spanContext().traceId, span.spanContext().spanId);
    span.end();
  });

describe('log', () => {
  it('writes one JSON line with severity and message outside a request', () => {
    expect(printed(() => log('server started'))).toEqual([
      { severity: 'INFO', message: 'server started' },
    ]);
  });

  it('writes the severity it is given', () => {
    expect(printed(() => log('write failed', 'ERROR'))).toEqual([
      { severity: 'ERROR', message: 'write failed' },
    ]);
  });

  it('adds the trace id of the active span', () => {
    inSpan((traceId) => {
      expect(printed(() => log('inside'))).toEqual([
        { severity: 'INFO', message: 'inside', traceId },
      ]);
    });
  });

  it('adds the fields Cloud Logging groups a trace by when the project is known', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'my-project');
    inSpan((traceId, spanId) => {
      expect(printed(() => log('inside'))).toEqual([
        {
          severity: 'INFO',
          message: 'inside',
          traceId,
          'logging.googleapis.com/trace': `projects/my-project/traces/${traceId}`,
          'logging.googleapis.com/spanId': spanId,
          'logging.googleapis.com/trace_sampled': true,
        },
      ]);
    });
  });
});
