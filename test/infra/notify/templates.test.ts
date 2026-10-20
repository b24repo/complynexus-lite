import { describe, expect, it } from 'vitest';
import { agentChanged, expired, magicLink, retestDueScheduled } from '../../../src/infra/notify/templates';
import type { RecordRef } from '../../../src/infra/notify/templates';

const rec: RecordRef = { recordId: 'CNL-2026-0001', orgName: 'Acme', agentName: 'BookBot' };
const url = 'https://example.com/verify/CNL-2026-0001?a=1&b=2';
const FOOTER = 'not certification';

describe('notify templates', () => {
  it('magicLink includes the url in text and an escaped href in html', () => {
    const m = magicLink(url);
    expect(m.text).toContain(url);
    expect(m.html).toContain('href="https://example.com/verify/CNL-2026-0001?a=1&amp;b=2"');
  });

  it('retestDueScheduled names the agent, record id and deadline', () => {
    const m = retestDueScheduled(rec, '2027-03-01T00:00:00Z', url);
    expect(m.subject).toContain('BookBot');
    expect(m.subject).toContain('CNL-2026-0001');
    expect(m.text).toContain('1 Mar 2027');
  });

  it('expired says the record expired and not to rely on it', () => {
    const m = expired(rec, url);
    expect(m.text).toContain('has expired');
    expect(m.text).toContain('not to rely on it');
  });

  it('agentChanged puts the re-test date in the subject', () => {
    expect(agentChanged(rec, '2027-03-01T00:00:00Z', url).subject).toContain('1 Mar 2027');
  });

  it('html escapes agent and org names', () => {
    const m = expired({ ...rec, agentName: '<script>alert(1)</script>', orgName: 'A&B' }, url);
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('A&amp;B');
  });

  it('every template ends with the not-certification footer', () => {
    const all = [
      magicLink(url),
      retestDueScheduled(rec, '2027-03-01T00:00:00Z', url),
      expired(rec, url),
      agentChanged(rec, '2027-03-01T00:00:00Z', url),
    ];
    for (const m of all) {
      expect(m.text.endsWith('does not guarantee compliance or safety.')).toBe(true);
      expect(m.text).toContain(FOOTER);
      expect(m.html).toContain(FOOTER);
    }
  });
});
