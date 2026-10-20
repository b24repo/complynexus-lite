import { describe, expect, it } from 'vitest';
import { agentFromForm, answersFromForm, entriesFromForm, runFromForm } from '../../src/web/forms';

describe('agentFromForm', () => {
  it('trims, splits tools and drops an empty limit', () => {
    const out = agentFromForm({
      orgName: ' Acme ',
      name: 'Bot',
      tools: ' gmail, ,calendar ',
      approvalLimitHkd: '',
    }) as Record<string, unknown>;
    expect(out.orgName).toBe('Acme');
    expect(out.tools).toEqual(['gmail', 'calendar']);
    expect('approvalLimitHkd' in out).toBe(false);
  });
  it('coerces the limit to a number and tolerates non-strings', () => {
    const out = agentFromForm({
      approvalLimitHkd: '500',
      name: ['x'],
    }) as Record<string, unknown>;
    expect(out.approvalLimitHkd).toBe(500);
    expect(out.name).toBe('');
  });
});

describe('flow form coercions', () => {
  it('answersFromForm ignores unknown keys and missing controls', () => {
    const out = answersFromForm({ 'AA-1': 'Missing', bogus: 'In place', _csrf: 'x' }) as {
      answers: { controlId: string; status: string }[];
    };
    expect(out.answers).toEqual([{ controlId: 'AA-1', status: 'Missing' }]);
  });

  it('runFromForm maps checkbox "on" to booleans', () => {
    const out = runFromForm({ size: 'full', attestation: 'on', freshChat: 'on' }) as {
      size: string;
      attestation: boolean;
      safety: Record<string, boolean>;
    };
    expect(out.size).toBe('full');
    expect(out.attestation).toBe(true);
    expect(out.safety).toEqual({ testRecipient: false, freshChat: true, unedited: false });
  });

  it('entriesFromForm keeps case order and omits sendNodeRan when absent', () => {
    const out = entriesFromForm({ 'reply-B': 'hi', 'send-A': 'no', 'skip-B': 'on' }, ['A', 'B']) as {
      entries: Record<string, unknown>[];
    };
    expect(out.entries.map((e) => e.caseId)).toEqual(['A', 'B']);
    expect(out.entries[0]).toEqual({ caseId: 'A', reply: undefined, sendNodeRan: 'no', skipped: false });
    expect('sendNodeRan' in out.entries[1]).toBe(false);
    expect(out.entries[1].skipped).toBe(true);
  });
});
