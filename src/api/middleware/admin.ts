import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { AppDeps } from '../deps';
import { HttpError } from '../errors';

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Throws 403 FORBIDDEN unless the request carries the configured X-Admin-Key. */
export function requireAdminKey(deps: AppDeps, req: Request): void {
  const key = req.header('X-Admin-Key');
  if (!deps.adminKey || !key || !sameKey(key, deps.adminKey)) throw new HttpError(403, 'FORBIDDEN');
}
