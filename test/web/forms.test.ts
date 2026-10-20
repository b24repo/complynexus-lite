import { describe, expect, it } from 'vitest';
import { agentFromForm } from '../../src/web/forms';

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
