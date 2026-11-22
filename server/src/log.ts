import { isSpanContextValid, trace } from '@opentelemetry/api';

export type Severity = 'INFO' | 'ERROR';

// One JSON line per call on stdout, which Cloud Run hands to Cloud Logging. During a request the
// line carries the trace id (the request id), and on Cloud Run the fields that group it with its
// trace. Lines never contain the need text, dependency names or a user id.
export function log(message: string, severity: Severity = 'INFO') {
  const line: Record<string, unknown> = { severity, message };
  const span = trace.getActiveSpan()?.spanContext();
  if (span && isSpanContextValid(span)) {
    line.traceId = span.traceId;
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (project) {
      line['logging.googleapis.com/trace'] = `projects/${project}/traces/${span.traceId}`;
      line['logging.googleapis.com/spanId'] = span.spanId;
      // Every request is traced (AlwaysOnSampler).
      line['logging.googleapis.com/trace_sampled'] = true;
    }
  }
  console.log(JSON.stringify(line));
}

export function secondsSince(start: number): string {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}
