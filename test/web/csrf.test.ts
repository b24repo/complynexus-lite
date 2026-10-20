import { describe, expect, it } from 'vitest';
import { csrfSecretFrom, csrfToken, csrfValid } from '../../src/web/csrf';

describe('csrf', () => {
  it('is stable per secret and session, and differs between sessions', () => {
    expect(csrfToken('s', 'a')).toBe(csrfToken('s', 'a'));
    expect(csrfToken('s', 'a')).not.toBe(csrfToken('s', 'b'));
    expect(csrfToken('s', 'a')).not.toBe(csrfToken('t', 'a'));
  });
  it('validates only the exact token', () => {
    const t = csrfToken('s', 'a');
    expect(csrfValid('s', 'a', t)).toBe(true);
    expect(csrfValid('s', 'a', undefined)).toBe(false);
    expect(csrfValid('s', 'a', t.slice(1))).toBe(false);
    expect(csrfValid('s', 'a', `${t.slice(0, -1)}${t.endsWith('0') ? '1' : '0'}`)).toBe(false);
    expect(csrfValid('s', 'b', t)).toBe(false);
  });
  it('prefers CSRF_SECRET, then ADMIN_KEY, else random', () => {
    expect(csrfSecretFrom({ CSRF_SECRET: 'c', ADMIN_KEY: 'a' })).toBe('c');
    expect(csrfSecretFrom({ ADMIN_KEY: 'a' })).toBe('a');
    const r1 = csrfSecretFrom({});
    expect(r1).toMatch(/^[0-9a-f]{64}$/);
    expect(csrfSecretFrom({})).not.toBe(r1);
  });
});
