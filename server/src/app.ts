import { randomUUID } from 'node:crypto';
import express, {
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { trace } from '@opentelemetry/api';
import { toNodeHandler } from 'better-auth/node';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import {
  type FeaturesResponse,
  type Me,
  type ReportRequest,
  type ReportResponse,
  reportRequestSchema,
} from 'shared';
import * as z from 'zod';
import { recordVisit, reportAnalytics, setFramework } from './analytics.js';
import { createAuth } from './auth.js';
import { NpmError } from './candidates.js';
import { enabledFor, isOn, readFlags } from './features.js';
import { ANONYMOUS_REPORTS_PER_IP_PER_DAY, checkDailyCap, REPORTS_PER_HOUR } from './limits.js';
import { log } from './log.js';
import { AiError } from './openrouter.js';
import { generateReport } from './report.js';
import {
  appendVersion,
  createShareLink,
  deleteByShareLink,
  deleteOwnedReport,
  findOwnedInputs,
  findOwnedReport,
  findReportById,
  findSharedReport,
  listReports,
  revokeShareLink,
  saveReport,
} from './reports.js';
import { requestSpan } from './tracing.js';
import { setUsageReport, usageOf, usageUser } from './usage.js';
import { loadUser, type User } from './users.js';

export function createApp(clientDir: string) {
  const app = express();
  // In production the app runs behind one proxy that appends the client IP to X-Forwarded-For, so
  // req.ip, used by the rate limit and analytics, is the last entry; earlier entries come from the
  // client and are ignored.
  app.set('trust proxy', 1);
  // First, so every request has its span and every log line its trace id.
  app.use(requestSpan);

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

  // One instance for new reports and refreshes, so both count toward the same hourly limit.
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

  // Anonymous reports only (a refresh needs a session); each IP's window starts at its first one.
  const anonymousDailyLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: ANONYMOUS_REPORTS_PER_IP_PER_DAY,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (_req, res) => res.locals.user !== undefined,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    message: {
      error: `Too many reports: the limit is ${ANONYMOUS_REPORTS_PER_IP_PER_DAY} per day without signing in.`,
    },
    handler: (_req, res, _next, options) => {
      log('rate limited per day');
      res.status(options.statusCode).json(options.message);
    },
  });

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

    app.get('/api/usage', ...withUser, requireAccounts, async (_req, res) => {
      const user = res.locals.user as User | undefined;
      if (!user) {
        res.status(401).json({ error: 'Sign in to see your usage.' });
        return;
      }
      res.json(await usageOf(user.id));
    });

    // 401, not 404, without a session: there is no report id to hide.
    app.get('/api/reports', ...withUser, requireAccounts, async (_req, res) => {
      const user = res.locals.user as User | undefined;
      if (!user) {
        res.status(401).json({ error: 'Sign in to see your reports.' });
        return;
      }
      res.json(await listReports(user.id));
    });

    app.get(
      '/api/reports/:id',
      ...withUser,
      requireAccounts,
      async (req: Request<{ id: string }>, res: Response) => {
        const user = res.locals.user as User | undefined;
        // No version means the latest; a version that cannot exist is a 404 like any other.
        const version =
          req.query.version === undefined ? undefined : versionSchema.safeParse(req.query.version);
        if (!user || !isUuid(req.params.id) || version?.success === false) return notFound(res);
        const report = await findOwnedReport(req.params.id, user.id, version?.data);
        if (!report) return notFound(res);
        res.json(report);
      },
    );

    app.delete(
      '/api/reports/:id',
      ...withUser,
      requireAccounts,
      async (req: Request<{ id: string }>, res: Response) => {
        const user = res.locals.user as User | undefined;
        const deleted =
          user && isUuid(req.params.id) && (await deleteOwnedReport(req.params.id, user.id));
        if (!deleted) return notFound(res);
        res.status(204).end();
      },
    );

    // Session and ownership are checked before the limits, so a stranger never spends anyone's
    // limit and no AI call is made for them.
    const ownReportInputs: RequestHandler<{ id: string }> = async (req, res, next) => {
      const user = res.locals.user as User | undefined;
      if (!user) {
        res.status(401).json({ error: 'Sign in to refresh a report.' });
        return;
      }
      const inputs = isUuid(req.params.id)
        ? await findOwnedInputs(req.params.id, user.id)
        : undefined;
      if (!inputs) return notFound(res);
      res.locals.inputs = inputs;
      next();
    };

    // Runs the pipeline again with the saved inputs and appends a refresh version.
    app.post(
      '/api/reports/:id/refresh',
      ...withUser,
      requireAccounts,
      ownReportInputs,
      usageUser,
      reportLimiter,
      checkDailyCap,
      async (req: Request<{ id: string }>, res: Response) => {
        const user = res.locals.user as User;
        const inputs = res.locals.inputs as ReportRequest;
        log(`refresh received: framework ${inputs.framework}`);
        setUsageReport(req.params.id);
        await appendVersion(req.params.id, user.id, await generateReport(inputs));
        markSaved(req.params.id);
        res.json(await findOwnedReport(req.params.id, user.id));
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

  app.post(
    '/api/report',
    reportAnalytics,
    ...withUser,
    usageUser,
    reportLimiter,
    // After the daily cap, so reports it refuses do not use up the IP's daily ones.
    checkDailyCap,
    anonymousDailyLimiter,
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
      if (saved) markSaved(id);
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
  app.use(unexpectedErrorHandler);

  return app;
}

// Last: any other failure. Only the error's name is logged: a database error's message lists the
// query parameters and a JSON parse error quotes the body, both of which can hold the need.
const unexpectedErrorHandler: ErrorRequestHandler = (
  error: Error & { status?: number },
  _req,
  res,
  next,
) => {
  // Too late for a JSON answer: Express's own handler closes the connection.
  if (res.headersSent) return next(error);
  // Client errors keep their status, for example 400 for malformed JSON from express.json().
  if (error.status && error.status < 500) {
    log(`request refused: ${error.name}`);
    res.status(error.status).json({ error: 'The request could not be read.' });
    return;
  }
  log(`request failed: ${error.name}`, 'ERROR');
  res.status(500).json({ error: 'Something went wrong. Please try again later.' });
};

// Leads from a report id to its trace: Cloud Trace finds the request span by this attribute, and
// Cloud Logging finds the line, which carries the trace id.
function markSaved(id: string) {
  trace.getActiveSpan()?.setAttribute('report.id', id);
  log(`report saved: ${id}`);
}

const aiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof AiError)) return next(error);
  log(`${error.step} failed: ${error.message}`, 'ERROR');
  if (error.modelOutput) log(`Rejected model output: ${error.modelOutput}`, 'ERROR');
  res.status(502).json({ error: `The AI step failed: ${error.message}` });
};

const npmErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof NpmError)) return next(error);
  log(`npm search failed: ${error.message}`, 'ERROR');
  res.status(502).json({ error: error.message });
};

// Report ids are uuids; anything else cannot exist, and Postgres would reject it as a uuid.
const isUuid = (id: string) => z.uuid().safeParse(id).success;

// Versions are numbered from 1, in a Postgres integer column: a larger number cannot exist.
const versionSchema = z.coerce.number().int().positive().max(2_147_483_647);

// The same answer for a missing, expired, unshared or other user's report.
function notFound(res: Response) {
  res.status(404).json({ error: 'Report not found.' });
}

// A share link is a secret: keep share pages out of search engines and out of the Referer header
// of every link followed from them.
function setPrivateHeaders(res: Response) {
  res.set({ 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
}
