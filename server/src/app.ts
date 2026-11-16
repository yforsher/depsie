import express, { type ErrorRequestHandler, type RequestHandler, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { type FeaturesResponse, type Me, reportRequestSchema } from 'shared';
import * as z from 'zod';
import { recordVisit, reportAnalytics, setFramework } from './analytics.js';
import { createAuth } from './auth.js';
import { NpmError } from './candidates.js';
import { enabledFor, isOn, readFlags } from './features.js';
import { checkCostCap, REPORTS_PER_HOUR } from './limits.js';
import { log, requestLogging } from './log.js';
import { AiError } from './openrouter.js';
import { generateReport } from './report.js';
import { usageUser } from './usage.js';
import { loadUser, type User } from './users.js';

export function createApp(clientDir: string) {
  const app = express();
  // In production the app runs behind one proxy that appends the client IP to X-Forwarded-For, so
  // req.ip, used by the rate limit and analytics, is the last entry; earlier entries come from the
  // client and are ignored.
  app.set('trust proxy', 1);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Read once: the environment does not change while the server runs.
  const flags = readFlags(process.env);
  // Sign-in exists while accounts is on or a list of logins.
  const auth = flags.accounts === false ? undefined : createAuth();
  const withUser = auth ? [loadUser(auth)] : [];
  const loginOf = (res: Response) =>
    (res.locals.user as User | undefined)?.githubLogin ?? undefined;

  app.get('/api/features', ...withUser, (_req, res) => {
    res.json({
      enabled: enabledFor(flags, loginOf(res)),
      signIn: !!auth,
    } satisfies FeaturesResponse);
  });

  // Routes of signed-in users: the same 404 as an unknown path for anyone the flag is not on for.
  const requireAccounts: RequestHandler = (_req, res, next) => {
    if (isOn(flags.accounts, loginOf(res))) next();
    else next('route');
  };

  if (auth) {
    // Before any body parser: Better Auth reads the request stream itself.
    app.all('/api/auth/*splat', toNodeHandler(auth));
    // null, not 401, when nobody is signed in: browsers log every 4xx answer as a console error.
    app.get('/api/me', ...withUser, requireAccounts, (_req, res) => {
      const user = res.locals.user as User | undefined;
      const me: Me | null = user
        ? {
            id: user.id,
            name: user.name,
            login: user.githubLogin!,
            image: user.image ?? null,
            email: user.email,
          }
        : null;
      res.json(me);
    });
  }

  const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: REPORTS_PER_HOUR,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Per signed-in user, so users behind one IP do not share a limit; per IP when anonymous.
    keyGenerator: (req, res) =>
      (res.locals.user as User | undefined)?.id ?? ipKeyGenerator(req.ip ?? ''),
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
    ...withUser,
    usageUser,
    reportLimiter,
    checkCostCap,
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
  app.use(npmErrorHandler);

  return app;
}

const aiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof AiError)) return next(error);
  log(`${error.step} failed: ${error.message}`);
  if (error.modelOutput) console.error(`Rejected model output: ${error.modelOutput}`);
  res.status(502).json({ error: `The AI step failed: ${error.message}` });
};

const npmErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof NpmError)) return next(error);
  log(`npm search failed: ${error.message}`);
  res.status(502).json({ error: error.message });
};
