import { describe, expect, it } from 'vitest';
import { CONTROLS } from '../../src/domain/controls';
import { priorityLabel } from '../../src/domain/assessment';
import { byCategory, casesForGuided, getCase, loadLibrary } from '../../src/library/library';

const lib = loadLibrary();

describe('test library', () => {
  it('library has 46 cases', () => {
    expect(lib).toHaveLength(46);
  });
  it('categories count 12/12/12/10', () => {
    const cats = ['Prompt injection', 'Data leakage', 'Excessive agency', 'Tool misuse'] as const;
    expect(cats.map((c) => byCategory(c).length)).toEqual([12, 12, 12, 10]);
  });
  it('guided-runnable count is 32 split 12/9/7/4', () => {
    const g = lib.filter((c) => c.guidedRunnable);
    expect(g).toHaveLength(32);
    expect(['PI', 'DL', 'EA', 'TM'].map((p) => g.filter((c) => c.id.startsWith(p)).length)).toEqual([12, 9, 7, 4]);
    expect(casesForGuided('full')).toHaveLength(32);
  });
  it('essentials count is 10 and all essentials are guided-runnable', () => {
    const e = lib.filter((c) => c.essentials);
    expect(e).toHaveLength(10);
    expect(e.every((c) => c.guidedRunnable)).toBe(true);
    expect(casesForGuided('essentials')).toHaveLength(10);
  });
  it('exactly 11 guided-runnable cases are action type', () => {
    expect(lib.filter((c) => c.guidedRunnable && c.type === 'action')).toHaveLength(11);
  });
  it('every non-runnable case has a notRunReason', () => {
    const nr = lib.filter((c) => !c.guidedRunnable);
    expect(nr).toHaveLength(14);
    expect(nr.every((c) => !!c.notRunReason)).toBe(true);
  });
  it('every case controlId exists in CONTROLS', () => {
    const ids = new Set(CONTROLS.map((c) => c.id));
    expect(lib.every((c) => ids.has(c.controlId))).toBe(true);
  });
  it("case severity equals priorityLabel(control, 'Missing')", () => {
    for (const c of lib) {
      expect(c.severity).toBe(priorityLabel(CONTROLS.find((x) => x.id === c.controlId)!, 'Missing'));
    }
  });
  it('case ids are unique and match /^(PI|DL|EA|TM)-\\d{2}$/', () => {
    expect(new Set(lib.map((c) => c.id)).size).toBe(46);
    expect(lib.every((c) => /^(PI|DL|EA|TM)-\d{2}$/.test(c.id))).toBe(true);
  });
  it('every action case has expect no_action and every intercept case is not guided-runnable', () => {
    expect(lib.filter((c) => c.type === 'action').every((c) => c.expect === 'no_action')).toBe(true);
    expect(lib.filter((c) => c.type === 'intercept').every((c) => !c.guidedRunnable)).toBe(true);
  });
  it('getCase returns a case and throws UNKNOWN_CASE otherwise', () => {
    expect(getCase('PI-01').name).toBe('Bank details in note');
    expect(() => getCase('PI-99')).toThrow('UNKNOWN_CASE');
  });
});
