import {
  type Attributes,
  context,
  diag,
  DiagLogLevel,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  type SpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import type { RequestHandler } from 'express';
import { GoogleAuth } from 'google-auth-library';
import { log, secondsSince } from './log.js';

// Registers the tracer provider and the context manager that carries the active span through
// async calls. Every request is traced, so its log lines always have a trace id.
export function startTracing(spanProcessors: SpanProcessor[], attributes: Attributes = {}) {
  // The SDK reports a failed export only through diag, which is silent unless given a logger.
  const sdkError = (message: string, ...args: unknown[]) =>
    log(`tracing: ${[message, ...args.map(String)].join(' ')}`, 'ERROR');
  diag.setLogger(
    {
      error: sdkError,
      warn: sdkError,
      info() {},
      debug() {},
      verbose() {},
    },
    { logLevel: DiagLogLevel.WARN, suppressOverrideMessage: true },
  );
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  const provider = new TracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors,
    resource: resourceFromAttributes(attributes),
  });
  trace.setGlobalTracerProvider(provider);
  return provider;
}

// On Cloud Run (K_SERVICE is set) spans go to Cloud Trace's OTLP endpoint in the background:
// the service keeps its CPU between requests (docs/hosting.md), so spans that end after the
// response are still sent. Elsewhere (local, tests, CI, e2e) nothing leaves the process.
export function cloudTraceExport(env: NodeJS.ProcessEnv) {
  if (!env.K_SERVICE) return { spanProcessors: [], attributes: {} };
  // The service account's token, renewed by the library (tokens expire after an hour).
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const exporter = new OTLPTraceExporter({
    url: 'https://telemetry.googleapis.com/v1/traces',
    headers: async () => Object.fromEntries((await auth.getRequestHeaders()).entries()),
  });
  return {
    spanProcessors: [new BatchSpanProcessor({ exporter })],
    // The endpoint rejects spans without gcp.project_id.
    attributes: { 'gcp.project_id': env.GOOGLE_CLOUD_PROJECT!, 'service.name': env.K_SERVICE },
  };
}

export const tracer = () => trace.getTracer('depsie');

// Runs fn in a new active span, so spans started inside it become its children; a throw marks
// the span as an error.
export function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      // The error's name only: messages can hold the npm search query or model output. The
      // message is in the log line of the failure, which carries the same trace id.
      span.setAttribute('error.type', (error as Error).name);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

// The span attributes of an outside call. The query string is left out: the npm search query
// holds keywords derived from the need.
export function callAttributes(url: string): Attributes {
  const { origin, pathname } = new URL(url);
  return { 'url.full': origin + pathname };
}

// fetch() in a span named for the host, with the response status.
export function tracedFetch(url: string, init: RequestInit): Promise<Response> {
  return withSpan(new URL(url).host, callAttributes(url), async (span) => {
    const res = await fetch(url, init);
    span.setAttribute('http.response.status_code', res.status);
    if (!res.ok) span.setStatus({ code: SpanStatusCode.ERROR });
    return res;
  });
}

// A new root span per request: its trace id is the request id of every log line written for it.
// Cloud Run's incoming trace is not continued, since Cloud Run samples it and ours would be lost.
export const requestSpan: RequestHandler = (req, res, next) => {
  const start = performance.now();
  tracer().startActiveSpan(req.method, { root: true, kind: SpanKind.SERVER }, (span) => {
    // 'finish' fires outside the request's async context, so the span's context is bound to it.
    res.on(
      'finish',
      context.bind(context.active(), () =>
        log(`response sent: ${res.statusCode} in ${secondsSince(start)}`),
      ),
    );
    res.on('close', () => {
      // The route pattern, never the path: paths hold report and share ids.
      if (req.route) span.updateName(`${req.method} ${req.route.path}`);
      span.setAttribute('http.response.status_code', res.statusCode);
      span.end();
    });
    next();
  });
};
