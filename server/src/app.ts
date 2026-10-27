import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { reportRequestSchema } from 'shared';
import * as z from 'zod';
import { recordVisit, reportAnalytics, setFramework } from './analytics.js';
import { log, requestLogging } from './log.js';
import { AiError } from './openrouter.js';
import { generateReport } from './report.js';

// Each report costs two AI calls, so the public endpoint is limited per IP.
const REPORTS_PER_HOUR = 10;

export function createApp(clientDir: string) {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: REPORTS_PER_HOUR,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: `Too many reports: the limit is ${REPORTS_PER_HOUR} per hour.` },
    handler: (_req, res, _next, options) => {
      log('rate limited');
      res.status(options.statusCode).json(options.message);
    },
  });

  app.post(
    '/api/report',
    requestLogging,
    reportAnalytics,
    reportLimiter,
    express.json(),
    async (req, res) => {
      const parsed = reportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const error = z.prettifyError(parsed.error);
        log(`invalid input: ${error.replaceAll('\n', ' ')}`);
        res.status(400).json({ error });
        return;
      }
      const { framework, dependencies = [] } = parsed.data;
      setFramework(framework);
      log(`request received: framework ${framework}, ${dependencies.length} dependencies`);
      res.json(await generateReport(parsed.data));
    },
  );

  // index: false sends the app shell through the fallback below, where visits are counted.
  app.use(express.static(clientDir, { index: false }));

  // Client routes get the app shell; unknown API paths fall through to a 404.
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    recordVisit(req);
    res.sendFile('index.html', { root: clientDir });
  });

  app.use(aiErrorHandler);

  return app;
}

const aiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof AiError)) return next(error);
  log(`${error.step} failed: ${error.message}`);
  if (error.modelOutput) console.error(`Rejected model output: ${error.modelOutput}`);
  res.status(502).json({ error: `The AI step failed: ${error.message}` });
};
