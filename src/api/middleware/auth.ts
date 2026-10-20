import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { AppDeps } from '../deps';
import { HttpError } from '../errors';
import type { Founder, Session } from '../../domain/types';
import { TOKEN_RE, hashToken } from '../../infra/tokens';

export const SESSION_COOKIE = 'cnl_session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

/** The Authorization header wins over the cookie. */
export function presentedToken(req: Request): string | null {
  const h = req.get('authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7).trim() || null;
  return parseCookies(req.get('cookie'))[SESSION_COOKIE] ?? null;
}

export async function currentSession(deps: AppDeps, req: Request): Promise<{ session: Session; founder: Founder } | null> {
  const token = presentedToken(req);
  if (!token || !TOKEN_RE.test(token)) return null;
  const session = await deps.repos.sessions.getById(hashToken(token));
  if (!session || session.expiresAt.getTime() <= deps.clock.now().getTime()) return null;
  const founder = await deps.repos.founders.getById(session.founderId);
  return founder ? { session, founder } : null;
}

export function requireFounder(deps: AppDeps): RequestHandler {
  return (req, res, next) => {
    currentSession(deps, req).then((cur) => {
      if (!cur) {
        next(new HttpError(401, 'AUTH_REQUIRED'));
        return;
      }
      res.locals.founder = cur.founder;
      res.locals.session = cur.session;
      next();
    }, next);
  };
}

export function founderOf(res: Response): Founder {
  const f = res.locals.founder as Founder | undefined;
  if (!f) throw new Error('requireFounder must run before this handler');
  return f;
}

export function sessionCookieOptions(req: Request, deps: AppDeps): CookieOptions {
  const secure = req.secure || (deps.publicBaseUrl?.startsWith('https://') ?? false);
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: deps.auth.sessionTtlMs };
}
