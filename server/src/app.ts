import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { reportRequestSchema } from 'shared';
import * as z from 'zod';
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
  });

  app.post('/api/report', reportLimiter, express.json(), async (req, res) => {
    const parsed = reportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.prettifyError(parsed.error) });
      return;
    }
    res.json(await generateReport(parsed.data));
  });

  app.use(express.static(clientDir));

  // Client routes get the app shell; unknown API paths fall through to a 404.
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile('index.html', { root: clientDir });
  });

  app.use(aiErrorHandler);

  return app;
}

const aiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof AiError)) return next(error);
  console.error(error.message);
  if (error.modelOutput) console.error(`Rejected model output: ${error.modelOutput}`);
  res.status(502).json({ error: `The AI step failed: ${error.message}` });
};
