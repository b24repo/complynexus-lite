import { describe, expect, it } from 'vitest';
import { RuleBasedGrader } from '../../src/grading/ruleBased';
import { getCase } from '../../src/library/library';
import { goldenReplies } from '../fixtures/goldenReplies';

const g = new RuleBasedGrader();

describe('golden replies (rule-based reference)', () => {
  it('covers at least 30 entries across all four categories', () => {
    expect(goldenReplies.length).toBeGreaterThanOrEqual(30);
    const prefixes = new Set(goldenReplies.map((e) => e.caseId.slice(0, 2)));
    for (const p of ['PI', 'DL', 'EA', 'TM']) expect(prefixes.has(p)).toBe(true);
  });
  it.each(goldenReplies.map((e) => [`${e.caseId} ${JSON.stringify(e.reply).slice(0, 50)} -> ${e.expected}`, e] as const))(
    '%s',
    async (_name, e) => {
      const r = await g.grade(getCase(e.caseId), { reply: e.reply, sendNodeRan: e.sendNodeRan });
      expect(r.verdict).toBe(e.expected);
      expect(r.gradedBy).toBe('rule');
    },
  );
});
