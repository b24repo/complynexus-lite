import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTH, assertProductionConfig, authConfig, createDefaultDeps } from '../../src/api/deps';
import { hashToken } from '../../src/infra/tokens';
import { ADMIN_KEY, FOUNDER_A, setup } from './helpers';
import type { NoopNotifier } from '../../src/infra/notify/notifier';
import type { FixedClock } from '../../src/infra/clock';

const MIN = 60_000;
const advance = (clock: FixedClock, ms: number) => clock.set(new Date(clock.now().getTime() + ms).toISOString());
const linkOf = (n: NoopNotifier) => new URL(n.sent.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
const pathOf = (u: URL) => u.pathname + u.search;
const SHORT_SESSION = { ...DEFAULT_AUTH };

describe('magic link sign-in', () => {
  it('works end to end and stores only hashes', async () => {
    const { anon, notifier, deps } = await setup();
    const email = 'new@example.com';
    await anon.post('/auth/magic-link').send({ email }).expect(202, { ok: true });
    expect(notifier.sent.at(-1)!.to).toBe(email);
    const link = linkOf(notifier);
    expect(link.pathname).toBe('/auth/callback');
    const token = link.searchParams.get('token')!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await deps.repos.loginTokens.getById(hashToken(token))).not.toBeNull();
    expect(await deps.repos.loginTokens.getById(token)).toBeNull();

    const cb = await anon.get(pathOf(link));
    expect(cb.status).toBe(303);
    expect(cb.headers.location).toBe('/auth/me');
    const me = await anon.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.founder).toMatchObject({ email });
    expect(me.body.founder.id).toBeTruthy();

    const sessionToken = /cnl_session=([^;]+)/.exec(String(cb.headers['set-cookie']))![1];
    expect(await deps.repos.sessions.getById(hashToken(sessionToken))).not.toBeNull();
    expect(await deps.repos.sessions.getById(sessionToken)).toBeNull();
  });

  it('answers identically for new and existing emails and creates one founder per email', async () => {
    const { anon, deps } = await setup();
    const before = await deps.repos.founders.count();
    const first = await anon.post('/auth/magic-link').send({ email: 'x@example.com' });
    const second = await anon.post('/auth/magic-link').send({ email: ' X@Example.com ' });
    const existing = await anon.post('/auth/magic-link').send({ email: FOUNDER_A });
    for (const r of [first, second, existing]) {
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ ok: true });
    }
    expect(await deps.repos.founders.count()).toBe(before + 1);
    expect((await anon.post('/auth/magic-link').send({ email: 'not-an-email' })).status).toBe(400);
  });

  it('is single use and rejects bad tokens', async () => {
    const { anon, notifier } = await setup();
    await anon.post('/auth/magic-link').send({ email: 'u@example.com' });
    const path = pathOf(linkOf(notifier));
    expect((await anon.get(path)).status).toBe(303);
    const again = await anon.get(path);
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe('INVALID_LOGIN_TOKEN');
    const garbage = await anon.get('/auth/callback?token=nope');
    expect(garbage.status).toBe(400);
    expect(garbage.body.error.code).toBe('VALIDATION');
    const unknown = await anon.get(`/auth/callback?token=${'a'.repeat(43)}`);
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_LOGIN_TOKEN');
  });

  it('expires login links after 15 minutes', async () => {
    const { anon, notifier, clock } = await setup();
    await anon.post('/auth/magic-link').send({ email: 'e@example.com' });
    const stale = pathOf(linkOf(notifier));
    advance(clock, 16 * MIN);
    expect((await anon.get(stale)).status).toBe(401);
    await anon.post('/auth/magic-link').send({ email: 'e@example.com' });
    const fresh = pathOf(linkOf(notifier));
    advance(clock, 14 * MIN);
    expect((await anon.get(fresh)).status).toBe(303);
  });

  it('sets a hardened session cookie, Secure only for an https public URL', async () => {
    const plain = await setup(undefined, { auth: SHORT_SESSION });
    await plain.anon.post('/auth/magic-link').send({ email: 'c@example.com' });
    const cb = await plain.anon.get(pathOf(linkOf(plain.notifier)));
    const cookie = String(cb.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).not.toContain('Secure');

    const https = await setup(undefined, { publicBaseUrl: 'https://staging.example.com' });
    await https.anon.post('/auth/magic-link').send({ email: 'c@example.com' });
    const link = https.notifier.sent.at(-1)!.text;
    expect(link).toContain('https://staging.example.com/auth/callback?token=');
    const cb2 = await request(https.server).get(pathOf(linkOf(https.notifier)));
    expect(String(cb2.headers['set-cookie'])).toContain('Secure');
  });

  it('accepts a Bearer session token and rejects a wrong one', async () => {
    const { token, server } = await setup();
    const ok = await request(server).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    const bad = await request(server).get('/auth/me').set('Authorization', `Bearer ${'b'.repeat(43)}`);
    expect(bad.status).toBe(401);
    expect((await request(server).get('/auth/me').set('Authorization', 'Bearer short')).status).toBe(401);
  });

  it('expires sessions after 30 days', async () => {
    const { app, clock } = await setup(undefined, { auth: SHORT_SESSION });
    expect((await app.get('/auth/me')).status).toBe(200);
    advance(clock, 31 * 24 * 60 * MIN);
    expect((await app.get('/auth/me')).status).toBe(401);
  });

  it('logout deletes the session and clears the cookie; anonymous logout is fine', async () => {
    const { app, anon, token, server } = await setup();
    const out = await app.post('/auth/logout');
    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/cnl_session=;/);
    expect((await app.get('/auth/me')).status).toBe(401);
    expect((await request(server).get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await anon.post('/auth/logout')).status).toBe(204);
  });

  it('rate limits magic-link requests and recovers after the window', async () => {
    const { anon, clock } = await setup(); // setup used 1 of 5
    for (let i = 0; i < 4; i++) expect((await anon.post('/auth/magic-link').send({ email: `r${i}@example.com` })).status).toBe(202);
    const limited = await anon.post('/auth/magic-link').send({ email: 'r9@example.com' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    advance(clock, 61_000);
    expect((await anon.post('/auth/magic-link').send({ email: 'r9@example.com' })).status).toBe(202);
  });
});

describe('dev link', () => {
  it('is a 404 by default, even with the admin key', async () => {
    const { anon } = await setup();
    const res = await anon.post('/auth/dev-link').set('X-Admin-Key', ADMIN_KEY).send({ email: 'd@example.com' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('when enabled needs the admin key and returns a usable link without sending email', async () => {
    const { anon, notifier } = await setup(undefined, { auth: { ...DEFAULT_AUTH, allowDevLogin: true } });
    const sentBefore = notifier.sent.length;
    const body = { email: 'd@example.com' };
    expect((await anon.post('/auth/dev-link').send(body)).status).toBe(403);
    expect((await anon.post('/auth/dev-link').set('X-Admin-Key', 'wrong').send(body)).status).toBe(403);
    const ok = await anon.post('/auth/dev-link').set('X-Admin-Key', ADMIN_KEY).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(notifier.sent.length).toBe(sentBefore);
    const u = new URL(ok.body.url);
    expect((await anon.get(u.pathname + u.search)).status).toBe(303);
    expect((await anon.get('/auth/me')).body.founder.email).toBe('d@example.com');
  });

  it('authConfig enables it only for ALLOW_DEV_LOGIN=1 together with an admin key', () => {
    expect(authConfig({ ALLOW_DEV_LOGIN: '1' }).allowDevLogin).toBe(false);
    expect(authConfig({ ALLOW_DEV_LOGIN: 'true', ADMIN_KEY: 'k' }).allowDevLogin).toBe(false);
    expect(authConfig({ ADMIN_KEY: 'k' }).allowDevLogin).toBe(false);
    expect(authConfig({ ALLOW_DEV_LOGIN: '1', ADMIN_KEY: 'k' }).allowDevLogin).toBe(true);
  });
});

describe('route protection', () => {
  const protectedRoutes: [string, string][] = [
    ['post', '/api/agents'],
    ['get', '/api/agents/x'],
    ['post', '/api/agents/x/assessment'],
    ['get', '/api/agents/x/assessment'],
    ['post', '/api/agents/x/changes'],
    ['post', '/api/agents/x/guided-runs'],
    ['get', '/api/guided-runs/x'],
    ['post', '/api/guided-runs/x/batches/1'],
    ['get', '/api/guided-runs/x/results'],
    ['get', '/api/records/CNL-2026-0001'],
    ['get', '/api/records/CNL-2026-0001/badge'],
    ['patch', '/api/records/CNL-2026-0001/public'],
    ['get', '/auth/me'],
  ];

  it.each(protectedRoutes)('%s %s returns 401 AUTH_REQUIRED when anonymous', async (method, path) => {
    const { anon } = await setup();
    const res = await (anon as unknown as Record<string, (p: string) => request.Test>)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('keeps library, verify, healthz and admin revoke outside founder auth', async () => {
    const { anon } = await setup();
    expect((await anon.get('/api/library')).status).toBe(200);
    expect((await anon.get('/verify/CNL-0000-0000')).status).toBe(404);
    const json = await anon.get('/verify/CNL-0000-0000.json');
    expect(json.status).toBe(404);
    expect(json.body.error.code).toBe('RECORD_NOT_FOUND');
    const revoke = await anon.post('/api/records/CNL-2026-0001/revoke').send({ reason: 'x' });
    expect(revoke.status).toBe(403);
    expect(revoke.body.error.code).toBe('FORBIDDEN');
    expect((await anon.get('/healthz')).status).toBe(200);
  });
});

describe('magic link base URL', () => {
  it('uses publicBaseUrl and ignores a spoofed Host header', async () => {
    const { anon, notifier } = await setup(undefined, { publicBaseUrl: 'https://staging.example.com' });
    await anon.post('/auth/magic-link').set('Host', 'evil.example').send({ email: 'v@example.com' }).expect(202);
    const text = notifier.sent.at(-1)!.text;
    expect(text).toContain('https://staging.example.com/auth/callback?token=');
    expect(text).not.toContain('evil.example');
  });

  it('rejects a non-local Host without publicBaseUrl and sends nothing', async () => {
    const { anon, notifier, deps } = await setup();
    const before = notifier.sent.length;
    const tokens = await deps.repos.loginTokens.count();
    const res = await anon.post('/auth/magic-link').set('Host', 'evil.example').send({ email: 'v@example.com' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PUBLIC_BASE_URL_REQUIRED');
    expect(notifier.sent.length).toBe(before);
    expect(await deps.repos.loginTokens.count()).toBe(tokens);
  });

  it('never falls back to the Host header in production', async () => {
    const { anon, deps } = await setup();
    deps.production = true; // after setup(), whose own sign-in needs a local host
    const res = await anon.post('/auth/magic-link').send({ email: 'v@example.com' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PUBLIC_BASE_URL_REQUIRED');
  });

  it('dev-link builds its URL the same way', async () => {
    const { anon } = await setup(undefined, { auth: { ...DEFAULT_AUTH, allowDevLogin: true } });
    const res = await anon.post('/auth/dev-link').set('Host', 'evil.example').set('X-Admin-Key', ADMIN_KEY).send({ email: 'v@example.com' });
    expect(res.status).toBe(500);
  });

  it('assertProductionConfig refuses to boot without PUBLIC_BASE_URL in production', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'production' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => assertProductionConfig({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://x.example' })).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => createDefaultDeps({ NODE_ENV: 'production' })).toThrow(/PUBLIC_BASE_URL/);
  });
});

describe('request log redaction', () => {
  it('redacts the login token from the logged path', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (s: string) => void lines.push(s) });
    const { anon } = await setup(undefined, { logger });
    await anon.get('/auth/callback?token=abc');
    const joined = lines.join('');
    expect(joined).toContain('token=[REDACTED]');
    expect(joined).not.toContain('token=abc');
  });
});
