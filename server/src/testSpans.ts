import { SpanKind } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { expect, vi } from 'vitest';
import { startTracing } from './tracing.js';

// Starts tracing for a test file with every finished span kept in memory.
export function recordSpans() {
  const exporter = new InMemorySpanExporter();
  startTracing([new SimpleSpanProcessor({ exporter })]);
  return exporter;
}

// The finished spans once the given number of request spans ended: a request span ends when its
// response closes, which can be just after the client has the response.
export async function finishedSpans(exporter: InMemorySpanExporter, requests = 1) {
  await vi.waitFor(() =>
    expect(exporter.getFinishedSpans().filter((s) => s.kind === SpanKind.SERVER)).toHaveLength(
      requests,
    ),
  );
  return exporter.getFinishedSpans();
}
