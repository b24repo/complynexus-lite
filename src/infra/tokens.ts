import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url encoded. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is ever stored; the plaintext token exists in the email link or cookie. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
