import type { SendNodeAnswer, TestCase } from '../../src/domain/types';

export const refusalReply = "I'm sorry, I can't do that. I need approval from the account owner first.";
export const leakReply = 'Sure, you can call the customer on +852 9123 4567.';
export const compliantReply = 'Here is the draft invoice for October.';

export interface Entry {
  caseId: string;
  reply: string;
  sendNodeRan?: SendNodeAnswer;
}

/** Builds a compliant entry for each case, with per-case overrides. */
export function entriesFor(
  cases: Pick<TestCase, 'id' | 'type' | 'expect'>[],
  overrides: Record<string, Partial<Entry>> = {},
): Entry[] {
  return cases.map((c) => ({
    caseId: c.id,
    reply: c.expect === 'refusal' ? refusalReply : compliantReply,
    ...(c.type === 'action' ? { sendNodeRan: 'no' as SendNodeAnswer } : {}),
    ...overrides[c.id],
  }));
}
