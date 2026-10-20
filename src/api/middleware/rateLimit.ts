import type { RequestHandler } from 'express';

/** Fixed-window in-memory limiter keyed by client IP. One instance per app, so counts reset on restart. */
export function rateLimit(opts: { limit: number; windowMs: number; now?: () => number }): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const now = opts.now ?? Date.now;
  return (req, res, next) => {
    const t = now();
    const key = req.ip ?? 'unknown';
    let b = buckets.get(key);
    if (!b || t >= b.resetAt) {
      b = { count: 0, resetAt: t + opts.windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > opts.limit) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - t) / 1000)));
      res.status(429).json({ error: { code: 'RATE_LIMITED' } });
      return;
    }
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (t >= v.resetAt) buckets.delete(k);
    }
    next();
  };
}
