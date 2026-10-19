import { describe, expect, it } from 'vitest';
import { RuleBasedGrader } from '../../src/grading/ruleBased';
import { planBatches, runSummary, startGuidedRun, submitBatch } from '../../src/guided/engine';
import type { GuidedRun, GuidedSize } from '../../src/domain/types';
import { casesForGuided, loadLibrary } from '../../src/library/library';
import { agentFixture } from '../fixtures/bookbot';
import { entriesFor } from '../fixtures/replies';

const lib = loadLibrary();
const grader = new RuleBasedGrader();
const now = new Date('2026-10-28T00:00:00Z');
const start = (size: GuidedSize) => startGuidedRun({ agent: agentFixture, size, runNumber: 1, now, library: lib });
const entriesForBatch = (run: GuidedRun, index: number) =>
  entriesFor(run.batches[index - 1].caseIds.map((id) => lib.find((c) => c.id === id)!));

async function runAll(run: GuidedRun, overrides = {}) {
  let r = run;
  for (const b of run.batches) {
    const entries = entriesFor(b.caseIds.map((id) => lib.find((c) => c.id === id)!), overrides);
    r = await submitBatch(r, b.index, entries, grader, now);
  }
  return r;
}

describe('guided engine', () => {
  it('full run plans 8 batches [5,5,2,5,4,5,2,4] in category order', () => {
    const b = planBatches(casesForGuided('full'));
    expect(b.map((x) => x.caseIds.length)).toEqual([5, 5, 2, 5, 4, 5, 2, 4]);
    expect(b.map((x) => x.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(b[0].category).toBe('Prompt injection');
    expect(b[7].category).toBe('Tool misuse');
  });
  it('essentials run plans [4,2,3,1]', () => {
    expect(planBatches(casesForGuided('essentials')).map((x) => x.caseIds.length)).toEqual([4, 2, 3, 1]);
  });
  it('new full run pre-fills 14 not_run results with the library notRunReason', () => {
    const run = start('full');
    expect(run.status).toBe('in_progress');
    expect(run.results).toHaveLength(14);
    expect(run.results.every((r) => r.verdict === 'not_run' && r.gradedBy === 'none')).toBe(true);
    const dl10 = run.results.find((r) => r.caseId === 'DL-10')!;
    expect(dl10.reason).toBe('Not run on this path: Need seeded test customer records');
  });
  it('new essentials run pre-fills 36 not_run results', () => {
    const run = start('essentials');
    expect(run.results).toHaveLength(36);
    expect(run.results.find((r) => r.caseId === 'PI-04')!.reason).toBe('Not in Essentials set');
  });
  it('submitBatch rejects an out-of-order batch index', async () => {
    const run = start('full');
    await expect(submitBatch(run, 2, entriesForBatch(run, 2), grader, now)).rejects.toThrow('BATCH_OUT_OF_ORDER');
    await expect(submitBatch(run, 99, [], grader, now)).rejects.toThrow('BATCH_OUT_OF_ORDER');
  });
  it('submitBatch rejects a missing or extra caseId', async () => {
    const run = start('full');
    const entries = entriesForBatch(run, 1);
    await expect(submitBatch(run, 1, entries.slice(1), grader, now)).rejects.toThrow('INVALID_BATCH');
    await expect(submitBatch(run, 1, [...entries, ...entriesForBatch(run, 2).slice(0, 1)], grader, now)).rejects.toThrow('INVALID_BATCH');
    await expect(submitBatch(run, 1, [...entries.slice(1), entries[1]], grader, now)).rejects.toThrow('INVALID_BATCH');
  });
  it("skipped entry is recorded as not_run 'Skipped by founder'", async () => {
    const run = start('full');
    const entries = entriesForBatch(run, 1).map((e, i) => (i === 0 ? { caseId: e.caseId, skipped: true } : e));
    const next = await submitBatch(run, 1, entries, grader, now);
    expect(next.results.find((r) => r.caseId === 'PI-01')).toMatchObject({ verdict: 'not_run', reason: 'Skipped by founder' });
    expect(next.batches[0].savedAt).toBeDefined();
    expect(run.batches[0].savedAt).toBeUndefined(); // input not mutated
  });
  it('run becomes completed after the last batch with completedAt set', async () => {
    const done = await runAll(start('full'));
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBe(now.toISOString());
  });
  it('summary after full run with fixture replies gives 32 run and 14 not run', async () => {
    const s = runSummary(await runAll(start('full')), lib);
    expect(s).toMatchObject({ run: 32, passed: 32, notRun: 14, total: 46 });
  });
  it('skipped cases do not count against passed/run', async () => {
    const s = runSummary(await runAll(start('full'), { 'PI-01': { skipped: true } }), lib);
    expect(s).toMatchObject({ run: 31, passed: 31, notRun: 15 });
  });
});
