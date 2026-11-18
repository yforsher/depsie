import { randomUUID } from 'node:crypto';
import express, {
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { toNodeHandler } from 'better-auth/node';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { type FeaturesResponse, type Me, type ReportResponse, reportRequestSchema } from 'shared';
import * as z from 'zod';
import { recordVisit, reportAnalytics, setFramework } from './analytics.js';
import { createAuth } from './auth.js';
import { NpmError } from './candidates.js';
import { enabledFor, isOn, readFlags } from './features.js';
import { checkCostCap, REPORTS_PER_HOUR } from './limits.js';
import { log, requestLogging } from './log.js';
import { AiError } from './openrouter.js';
import { generateReport } from './report.js';
import {
  createShareLink,
  deleteByShareLink,
  findOwnedReport,
  findReportById,
  findSharedReport,
  revokeShareLink,
  saveReport,
} from './reports.js';
import { setUsageReport, usageUser } from './usage.js';
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

    app.get(
      '/api/reports/:id',
      ...withUser,
      requireAccounts,
      async (req: Request<{ id: string }>, res: Response) => {
        const user = res.locals.user as User | undefined;
        const report =
          user && isUuid(req.params.id) ? await findOwnedReport(req.params.id, user.id) : undefined;
        if (!report) return notFound(res);
        res.json(report);
      },
    );

    // Revoking is for owners only: an anonymous link ends by deleting the report.
    app.delete(
      '/api/reports/:id/share',
      ...withUser,
      requireAccounts,
      async (req: Request<{ id: string }>, res: Response) => {
        const found = await reportToShare(req.params.id, res);
        if (!found || found.userId === null) return notFound(res);
        res.json(await revokeShareLink(found));
      },
    );
  }

  // The report a caller may create or revoke a link for: their own while accounts is on for them,
  // or an anonymous one while report-links is on, for anyone with its id (only its creator got it).
  async function reportToShare(id: string, res: Response) {
    const found = isUuid(id) ? await findReportById(id) : undefined;
    if (!found) return undefined;
    if (found.userId === null) return isOn(flags['report-links']) ? found : undefined;
    const user = res.locals.user as User | undefined;
    return found.userId === user?.id && isOn(flags.accounts, loginOf(res)) ? found : undefined;
  }

  if (flags.accounts !== false || flags['report-links']) {
    app.post(
      '/api/reports/:id/share',
      ...withUser,
      async (req: Request<{ id: string }>, res: Response) => {
        const found = await reportToShare(req.params.id, res);
        if (!found) return notFound(res);
        res.json(await createShareLink(found));
      },
    );

    // Anyone with the link, signed in or not.
    app.get('/api/s/:shareId', async (req, res) => {
      setPrivateHeaders(res);
      const shared = await findSharedReport(req.params.shareId);
      // Anonymous links (the deletable ones) exist only while report-links is on.
      if (!shared || (shared.deletable && !isOn(flags['report-links']))) return notFound(res);
      res.json(shared);
    });
  }

  if (flags['report-links']) {
    app.delete('/api/s/:shareId', async (req, res) => {
      if (!(await deleteByShareLink(req.params.shareId))) return notFound(res);
      res.status(204).end();
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
      // Saved to the user while accounts is on for them, else anonymously while report-links is on.
      const user = res.locals.user as User | undefined;
      const owner = user && isOn(flags.accounts, loginOf(res)) ? user.id : null;
      const save = owner !== null || isOn(flags['report-links']);
      const id = randomUUID();
      // Not for a signed-in user's anonymous report: their usage rows would link them to it.
      if (save && (owner !== null || !user)) setUsageReport(id);
      const report = await generateReport(parsed.data);
      const saved = save ? await saveReport(id, owner, parsed.data, report) : null;
      res.json({ report, saved } satisfies ReportResponse);
    },
  );

  // index: false sends the app shell through the fallback below, where visits are counted.
  app.use(express.static(clientDir, { index: false }));

  // Client routes get the app shell; unknown API paths fall through to a 404.
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/s/')) setPrivateHeaders(res);
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

// Report ids are uuids; anything else cannot exist, and Postgres would reject it as a uuid.
const isUuid = (id: string) => z.uuid().safeParse(id).success;

// The same answer for a missing, expired, unshared or other user's report.
function notFound(res: Response) {
  res.status(404).json({ error: 'Report not found.' });
}

// A share link is a secret: keep share pages out of search engines and out of the Referer header
// of every link followed from them.
function setPrivateHeaders(res: Response) {
  res.set({ 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
}
