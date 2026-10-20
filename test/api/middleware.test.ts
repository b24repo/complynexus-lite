import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAgent, assess, setup } from './helpers';
import { rateLimit } from '../../src/api/middleware/rateLimit';

describe('request id', () => {
  it('echoes a valid incoming id and generates a UUID otherwise', async () => {
    const { app } = setup();
    const a = await request(app).get('/healthz').set('X-Request-Id', 'abc-1.2_3');
    expect(a.headers['x-request-id']).toBe('abc-1.2_3');
    const b = await request(app).get('/healthz').set('X-Request-Id', 'bad id!');
    expect(b.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const c = await request(app).get('/healthz');
    expect(c.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error handler', () => {
  it('logs unknown errors with the request id and returns 500', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (s: string) => void lines.push(s) });
    const { app, deps } = setup(undefined, { logger });
    deps.repos.agents.getById = async () => {
      throw new Error('boom');
    };
    const res = await request(app).get('/api/agents/whatever').set('X-Request-Id', 'abc');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', requestId: 'abc' } });
    const entries = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const err = entries.find((e) => e.msg === 'unhandled error');
    expect(err).toMatchObject({ reqId: 'abc', method: 'GET' });
    expect(entries.some((e) => e.msg === 'request' && e.status === 500 && e.reqId === 'abc')).toBe(true);
  });

  it('rejects JSON bodies over 100kb with 413 and does not log them as unknown', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (s: string) => void lines.push(s) });
    const { app } = setup(undefined, { logger });
    const res = await request(app).post('/api/agents').send({ orgName: 'x'.repeat(150_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(lines.some((l) => l.includes('unhandled error'))).toBe(false);
  });
});

describe('rate limit', () => {
  it('returns 429 with Retry-After on /verify past the limit; other routes are unaffected', async () => {
    const { app } = setup(undefined, { verifyRateLimit: { limit: 3, windowMs: 60_000 } });
    for (let i = 0; i < 3; i++) expect((await request(app).get('/verify/CNL-2026-9999.json')).status).toBe(404);
    const limited = await request(app).get('/verify/CNL-2026-9999.json');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: { code: 'RATE_LIMITED' } });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) expect((await request(app).get('/healthz')).status).toBe(200);
  });

  it('resets after the window and prunes stale buckets', () => {
    let t = 0;
    const mw = rateLimit({ limit: 1, windowMs: 1000, now: () => t });
    const status: number[] = [];
    const run = (ip: string) => {
      const res = {
        setHeader: () => undefined,
        status(code: number) {
          status.push(code);
          return { json: () => undefined };
        },
      };
      let passed = false;
      mw({ ip } as never, res as never, () => {
        passed = true;
      });
      return passed;
    };
    expect(run('a')).toBe(true);
    expect(run('a')).toBe(false);
    t = 1000;
    expect(run('a')).toBe(true);
    for (let i = 0; i < 10_001; i++) run(`ip${i}`);
    t = 5000;
    expect(run('fresh')).toBe(true);
    expect(status).toContain(429);
  });
});

describe('security headers', () => {
  it('sets helmet headers and keeps the verify page renderable', async () => {
    const { app } = setup();
    const agentId = await createAgent(app);
    const a = await assess(app, agentId);
    const res = await request(app).get(`/verify/${a.body.record.recordId}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('fonts.googleapis.com');
    expect(csp).toContain('fonts.gstatic.com');
    expect(res.text).toContain('What does this record mean?');
  });
});
