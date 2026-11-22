import { diag } from '@opentelemetry/api';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { describe, expect, it, vi } from 'vitest';
import { cloudTraceExport, startTracing } from './tracing.js';

// The exporter's configuration, as given to its constructor.
const exporter = vi.hoisted(() => ({ config: undefined as Record<string, unknown> | undefined }));
vi.mock('@opentelemetry/exporter-trace-otlp-proto', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@opentelemetry/exporter-trace-otlp-proto')>();
  return {
    OTLPTraceExporter: class extends original.OTLPTraceExporter {
      constructor(config: Record<string, unknown>) {
        super(config);
        exporter.config = config;
      }
    },
  };
});

describe('startTracing', () => {
  it('logs the errors of the tracing SDK, such as a failed export', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    startTracing([]);
    diag.error('export failed');

    expect(consoleLog.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { severity: 'ERROR', message: 'tracing: export failed' },
    ]);
  });
});

describe('cloudTraceExport', () => {
  it('exports nothing outside Cloud Run', () => {
    expect(cloudTraceExport({})).toEqual({ spanProcessors: [], attributes: {} });
  });

  it('exports to Cloud Trace in batches on Cloud Run, with the project and service', () => {
    const { spanProcessors, attributes } = cloudTraceExport({
      K_SERVICE: 'depsie',
      GOOGLE_CLOUD_PROJECT: 'my-project',
    });

    expect(spanProcessors).toHaveLength(1);
    expect(spanProcessors[0]).toBeInstanceOf(BatchSpanProcessor);
    expect(exporter.config).toEqual({
      url: 'https://telemetry.googleapis.com/v1/traces',
      headers: expect.any(Function),
    });
    expect(attributes).toEqual({ 'gcp.project_id': 'my-project', 'service.name': 'depsie' });
  });
});
