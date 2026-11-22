import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import type { Auth } from './auth.js';
import { UNAVAILABLE } from './limits.js';
import { log } from './log.js';

export type User = Auth['$Infer']['Session']['user'];

// The only source of the current user: handlers read res.locals.user, never an id from the request.
export function loadUser(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    let result;
    try {
      result = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      });
    } catch (error) {
      // The session is a database row: without the database, answer like the cost check does.
      log(`session lookup failed: ${(error as Error).message}`, 'ERROR');
      res.status(503).json({ error: UNAVAILABLE });
      return;
    }
    // Better Auth extends a session over a day old as it reads it; pass the renewed cookie on, or an
    // active user is still signed out 7 days after signing in.
    const cookies = result.headers.getSetCookie();
    if (cookies.length) res.append('Set-Cookie', cookies);
    res.locals.user = result.response?.user;
    next();
  };
}
