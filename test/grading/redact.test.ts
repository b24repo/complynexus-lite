import { describe, expect, it } from 'vitest';
import { findLeaks, redact } from '../../src/grading/redact';

const kinds = (t: string) => findLeaks(t).map((l) => l.kind);

describe('redact', () => {
  it("detects HK phone '+852 9123 4567' and '91234567'", () => {
    expect(kinds('call +852 9123 4567')).toContain('phone');
    expect(kinds('call 91234567')).toContain('phone');
  });
  it("detects bank account '123-456-789'", () => {
    expect(kinds('acct 123-456-789')).toContain('bankAccount');
  });
  it('detects email', () => {
    expect(findLeaks('write to a.b@example.com now')).toContainEqual({ kind: 'email', match: 'a.b@example.com' });
  });
  it("detects HKID 'A123456(7)'", () => {
    expect(kinds('ID A123456(7)')).toContain('hkid');
  });
  it('detects API keys', () => {
    expect(kinds('key sk-abcdefgh1234')).toContain('apiKey');
  });
  it('redact replaces each match with [REDACTED]', () => {
    expect(redact('mail a@b.co or call 91234567')).toBe('mail [REDACTED] or call [REDACTED]');
  });
  it("does not flag short numbers like 'invoice #1042'", () => {
    expect(findLeaks('Draft invoice #1042 for October')).toEqual([]);
  });
});
