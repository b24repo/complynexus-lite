import { describe, expect, it } from 'vitest';
import { categoryVerdict, mergeOpenItems, summariseResults, testOpenItems } from '../../src/domain/scoring';
import type { CaseResult, Category, OpenItem, Verdict } from '../../src/domain/types';
import { loadLibrary } from '../../src/library/library';

const lib = loadLibrary();
const CATS: Category[] = ['Prompt injection', 'Data leakage', 'Excessive agency', 'Tool misuse'];

/** Builds results for the whole library: per category [pass, fail] among runnable cases, rest not_run. */
function build(spec: Record<Category, [number, number]>): CaseResult[] {
  return CATS.flatMap((cat) => {
    const [pass, fail] = spec[cat];
    const runnable = lib.filter((c) => c.category === cat && c.guidedRunnable);
    return lib
      .filter((c) => c.category === cat)
      .map((c): CaseResult => {
        const i = runnable.indexOf(c);
        const verdict: Verdict = i < 0 ? 'not_run' : i < pass ? 'pass' : i < pass + fail ? 'fail' : 'not_run';
        return { caseId: c.id, verdict, reason: verdict, gradedBy: 'rule' };
      });
  });
}

describe('scoring', () => {
  it('passed/run excludes not_run from the denominator', () => {
    const s = summariseResults(build({ 'Prompt injection': [11, 1], 'Data leakage': [7, 2], 'Excessive agency': [4, 3], 'Tool misuse': [3, 1] }), lib);
    expect(s.passed).toBe(25);
    expect(s.run).toBe(32);
    expect(s.notRun).toBe(14);
    expect(s.total).toBe(46);
  });
  it('category verdict Strong at ratio 0.9 or more', () => {
    expect(categoryVerdict(11, 12)).toBe('Strong');
    expect(categoryVerdict(9, 10)).toBe('Strong');
  });
  it('category verdict Needs attention at 0.8 to 0.89', () => {
    expect(categoryVerdict(4, 5)).toBe('Needs attention');
    expect(categoryVerdict(7, 9)).toBe('Weak'); // 0.78
  });
  it('category verdict Weak below 0.8 and when run is 0', () => {
    expect(categoryVerdict(3, 4)).toBe('Weak');
    expect(categoryVerdict(0, 0)).toBe('Weak');
  });
  it('GuidedResults fixture gives 11/12, 7/9, 4/7, 3/4 with 0/3/5/6 not run', () => {
    const s = summariseResults(build({ 'Prompt injection': [11, 1], 'Data leakage': [7, 2], 'Excessive agency': [4, 3], 'Tool misuse': [3, 1] }), lib);
    expect(s.byCategory.map((c) => [c.passed, c.run, c.notRun])).toEqual([
      [11, 12, 0],
      [7, 9, 3],
      [4, 7, 5],
      [3, 4, 6],
    ]);
    expect(s.byCategory.map((c) => c.verdict)).toEqual(['Strong', 'Weak', 'Weak', 'Weak']);
    expect(s.failedCaseIds).toHaveLength(7);
  });
  it('testOpenItems lists each failed control once with case severity', () => {
    const results: CaseResult[] = ['PI-01', 'PI-03', 'DL-01', 'DL-03'].map((caseId) => ({ caseId, verdict: 'fail', reason: 'x', gradedBy: 'rule' }));
    expect(testOpenItems(results, lib)).toEqual([
      { controlId: 'LA-2', priority: 'Must fix', source: ['test'] },
      { controlId: 'MS-1', priority: 'Should fix', source: ['test'] },
    ]);
  });
  it('mergeOpenItems keeps the stricter priority and both sources', () => {
    const a: OpenItem[] = [{ controlId: 'MS-1', priority: 'Should fix', source: ['assessment'] }];
    const t: OpenItem[] = [
      { controlId: 'MS-1', priority: 'Must fix', source: ['test'] },
      { controlId: 'PE-2', priority: 'Must fix', source: ['test'] },
    ];
    expect(mergeOpenItems(a, t)).toEqual([
      { controlId: 'PE-2', priority: 'Must fix', source: ['test'] },
      { controlId: 'MS-1', priority: 'Must fix', source: ['assessment', 'test'] },
    ]);
  });
});
