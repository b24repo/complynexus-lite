import type { Request, Router } from 'express';
import type { AppDeps } from '../deps';
import { HttpError } from '../errors';
import { asyncRouter } from '../helpers';
import { requireAdminKey } from '../middleware/admin';
import { SESSION_COOKIE, currentSession, founderOf, requireFounder, sessionCookieOptions } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { CallbackQuery, EmailBody } from '../schemas';
import type { Founder } from '../../domain/types';
import { uuid } from '../../infra/ids';
import { magicLink } from '../../infra/notify/templates';
import { hashToken, newToken } from '../../infra/tokens';

const isForm = (req: Request): boolean => !!req.is('application/x-www-form-urlencoded');

export function authRoutes(deps: AppDeps): Router {
  const router = asyncRouter();
  const nowMs = () => deps.clock.now().getTime();
  const perIp = rateLimit({ ...deps.auth.magicLinkRateLimit, now: nowMs });
  const perEmail = rateLimit({
    ...deps.auth.magicLinkRateLimit,
    now: nowMs,
    key: (req) => `email:${String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase()}`,
  });
  /** Never trusts the Host header in production; elsewhere only for local dev hosts. */
  const baseUrl = (req: Request): string => {
    if (deps.publicBaseUrl) return deps.publicBaseUrl;
    const host = req.get('host') ?? '';
    if (!deps.production && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `${req.protocol}://${host}`;
    deps.logger.error({ host }, 'PUBLIC_BASE_URL is required to build magic links');
    throw new HttpError(500, 'PUBLIC_BASE_URL_REQUIRED');
  };

  async function findOrCreateFounder(email: string): Promise<Founder> {
    const found = (await deps.repos.founders.find(() => true, { email }))[0];
    if (found) return found;
    try {
      return await deps.repos.founders.insert({ id: uuid(), email, createdAt: deps.clock.now().toISOString() });
    } catch (e) {
      // Lost a race on the unique email index: the other request created it.
      if (e instanceof Error && /Duplicate id/.test(e.message)) {
        const again = (await deps.repos.founders.find(() => true, { email }))[0];
        if (again) return again;
      }
      throw e;
    }
  }

  async function issueLoginLink(req: Request, email: string): Promise<{ token: string; url: string }> {
    const base = baseUrl(req); // fail before creating anything
    const founder = await findOrCreateFounder(email);
    const token = newToken();
    const now = deps.clock.now();
    await deps.repos.loginTokens.insert({
      id: hashToken(token),
      founderId: founder.id,
      email,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + deps.auth.loginTokenTtlMs),
      usedAt: null,
    });
    return { token, url: `${base}/auth/callback?token=${token}` };
  }

  router.post('/magic-link', perIp, perEmail, async (req, res) => {
    const parsed = EmailBody.safeParse(req.body);
    if (!parsed.success) {
      if (isForm(req)) {
        res.redirect(303, '/app/sign-in?error=email');
        return;
      }
      throw parsed.error;
    }
    const { email } = parsed.data;
    const { url } = await issueLoginLink(req, email);
    await deps.notifier.send({ to: email, ...magicLink(url) });
    // Identical whether or not the email already existed.
    if (isForm(req)) {
      res.redirect(303, '/app/sign-in/sent');
      return;
    }
    res.status(202).json({ ok: true });
  });

  router.get('/callback', async (req, res) => {
    const { token } = CallbackQuery.parse(req.query);
    const now = deps.clock.now();
    const consumed = await deps.repos.loginTokens.consume(hashToken(token), now);
    if (!consumed) throw new HttpError(401, 'INVALID_LOGIN_TOKEN');
    const sessionToken = newToken();
    await deps.repos.sessions.insert({
      id: hashToken(sessionToken),
      founderId: consumed.founderId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + deps.auth.sessionTtlMs),
    });
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions(req, deps));
    res.redirect(303, deps.auth.redirectPath);
  });

  router.post('/logout', async (req, res) => {
    const cur = await currentSession(deps, req);
    if (cur) await deps.repos.sessions.delete(cur.session.id);
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(req, deps), maxAge: undefined });
    if (isForm(req)) {
      res.redirect(303, '/app/sign-in');
      return;
    }
    res.status(204).end();
  });

  router.get('/me', requireFounder(deps), async (_req, res) => {
    const f = founderOf(res);
    res.json({ founder: { id: f.id, email: f.email } });
  });

  router.post('/dev-link', async (req, res) => {
    // Disabled routes look absent; this check comes before the admin key check.
    if (!deps.auth.allowDevLogin) throw new HttpError(404, 'NOT_FOUND');
    requireAdminKey(deps, req);
    const { email } = EmailBody.parse(req.body);
    res.status(201).json(await issueLoginLink(req, email));
  });

  return router;
}
