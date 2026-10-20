import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_FIELD = '_csrf';

/** CSRF_SECRET, then ADMIN_KEY, else a per-process random value (dev only). */
export function csrfSecretFrom(env: NodeJS.ProcessEnv): string {
  return env.CSRF_SECRET?.trim() || env.ADMIN_KEY?.trim() || randomBytes(32).toString('hex');
}

export function csrfToken(secret: string, sessionId: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('hex');
}

export function csrfValid(secret: string, sessionId: string, presented: unknown): boolean {
  if (typeof presented !== 'string') return false;
  const a = Buffer.from(csrfToken(secret, sessionId));
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}
