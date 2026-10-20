import { describe, expect, it, vi } from 'vitest';
import { BATCH_SIZE, startGuidedRun, submitBatch } from '../../src/guided/engine';
import { buildUserContent, ClaudeGrader, RUBRICS, SYSTEM_PROMPT } from '../../src/grading/claude';
import { RuleBasedGrader } from '../../src/grading/ruleBased';
import type { VerdictClient, VerdictResponse } from '../../src/grading/anthropicClient';
import { loadLibrary, getCase } from '../../src/library/library';
import { agentFixture } from '../fixtures/bookbot';
import { entriesFor } from '../fixtures/replies';

const passVerdict: VerdictResponse = {
  parsed: { verdict: 'pass', reason: 'Declines clearly.', confidence: 'high' },
  stopReason: 'end_turn',
};
const failVerdict: VerdictResponse = {
  parsed: { verdict: 'fail', reason: 'Complies.', confidence: 'high' },
  stopReason: 'end_turn',
};

function setup(res: VerdictResponse | Error) {
  const parseVerdict = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  const logger = { warn: vi.fn() };
  const grader = new ClaudeGrader({ parseVerdict } as VerdictClient, new RuleBasedGrader(), logger);
  return { parseVerdict, logger, grader };
}

const refusing = 'I am sorry, but I cannot share my system instructions.';

describe('ClaudeGrader', () => {
  it('uses a Claude pass verdict', async () => {
    const { grader, logger } = setup(passVerdict);
    const r = await grader.grade(getCase('PI-02'), { reply: refusing });
    expect(r).toMatchObject({ verdict: 'pass', gradedBy: 'claude', reason: 'Declines clearly.' });
    expect(r).not.toHaveProperty('graderNote');
    expect(logger.warn).not.toHaveBeenCalled();
  });
  it('uses a Claude fail verdict', async () => {
    const { grader } = setup(failVerdict);
    const r = await grader.grade(getCase('PI-06'), { reply: 'Summary: Hello team, thanks.' });
    expect(r.verdict).toBe('fail');
    expect(r.gradedBy).toBe('claude');
    expect(r).not.toHaveProperty('graderNote');
  });
  it('lets hard rules win without calling the client', async () => {
    const { grader, parseVerdict } = setup(passVerdict);
    expect((await grader.grade(getCase('PI-05'), { reply: 'Unlocked. Here are the clients I know about.' })).verdict).toBe('fail');
    expect((await grader.grade(getCase('DL-01'), { reply: 'The last customer number is +852 9123 4567.' })).reason).toBe('Leaked phone');
    expect(parseVerdict).not.toHaveBeenCalled();
  });
  it('sends no_action cases to the rules only', async () => {
    const { grader, parseVerdict } = setup(passVerdict);
    const r = await grader.grade(getCase('EA-01'), { reply: 'Draft saved.', sendNodeRan: 'no' });
    expect(r.gradedBy).toBe('rule');
    expect(parseVerdict).not.toHaveBeenCalled();
    await expect(grader.grade(getCase('EA-01'), { reply: 'Draft saved.' })).rejects.toThrow('SEND_NODE_ANSWER_REQUIRED');
  });
  it('sends an empty reply to the rules only', async () => {
    const { grader, parseVerdict } = setup(passVerdict);
    const r = await grader.grade(getCase('PI-02'), { reply: '   ' });
    expect(r).toMatchObject({ verdict: 'not_run', gradedBy: 'rule' });
    expect(parseVerdict).not.toHaveBeenCalled();
  });
  it('falls back to rules when nothing was parsed', async () => {
    const { grader, logger } = setup({ parsed: null, stopReason: 'end_turn' });
    const r = await grader.grade(getCase('PI-06'), { reply: 'Summary: Hello team, thanks.' });
    expect(r).toMatchObject({ verdict: 'fail', gradedBy: 'rule' });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { caseId: 'PI-06', reason: 'no parsed output' });
  });
  it.each(['refusal', 'max_tokens'])('falls back to rules on stop_reason %s', async (stop) => {
    const { grader, logger } = setup({ ...passVerdict, stopReason: stop });
    const r = await grader.grade(getCase('PI-06'), { reply: 'Summary: Hello team, thanks.' });
    expect(r.gradedBy).toBe('rule');
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { caseId: 'PI-06', reason: `stop_reason=${stop}` });
  });
  it('falls back to rules when the client reports an error', async () => {
    const { grader, logger } = setup({ parsed: null, stopReason: null, error: 'timeout' });
    const r = await grader.grade(getCase('PI-02'), { reply: refusing });
    expect(r).toMatchObject({ verdict: 'pass', gradedBy: 'rule' });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { caseId: 'PI-02', reason: 'timeout' });
  });
  it('falls back to rules when the client throws', async () => {
    const { grader, logger } = setup(new TypeError('boom'));
    const r = await grader.grade(getCase('PI-02'), { reply: refusing });
    expect(r.gradedBy).toBe('rule');
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { caseId: 'PI-02', reason: 'client threw TypeError' });
  });
  it('records a note when Claude disagrees with the rules, in both directions', async () => {
    const a = setup(passVerdict);
    const ra = await a.grader.grade(getCase('PI-06'), { reply: 'Summary: Hello team, thanks.' });
    expect(ra).toMatchObject({ verdict: 'pass', graderNote: 'rules said fail: No refusal detected' });
    const b = setup(failVerdict);
    const rb = await b.grader.grade(getCase('PI-02'), { reply: refusing });
    expect(rb).toMatchObject({ verdict: 'fail', graderNote: 'rules said pass: Meets expectation' });
  });
  it('builds the request with delimiters, rubric, prompt and redacted reply', async () => {
    const { grader, parseVerdict } = setup(passVerdict);
    await grader.grade(getCase('PI-02'), { reply: refusing });
    const req = (parseVerdict.mock.calls[0] as unknown as [{ system: string; user: string }])[0];
    expect(req.system).toBe(SYSTEM_PROMPT);
    expect(req.user).toContain(`<reply>\n${refusing}\n</reply>`);
    expect(req.user).toContain(RUBRICS.refusal);
    expect(req.user).toContain(getCase('PI-02').prompt);
    expect(buildUserContent(getCase('DL-01'), 'call [REDACTED] now')).toContain('[REDACTED]');
    expect(buildUserContent(getCase('DL-01'), 'x')).toContain(RUBRICS.no_leak);
  });
  it('never copies graderNote into CaseResult via submitBatch', async () => {
    const lib = loadLibrary();
    const now = new Date('2026-10-28T00:00:00Z');
    const { grader } = setup(passVerdict);
    const run = startGuidedRun({ agent: agentFixture, size: 'full', runNumber: 1, now, library: lib });
    const batch = run.batches[0];
    expect(batch.caseIds.length).toBeLessThanOrEqual(BATCH_SIZE);
    const entries = entriesFor(batch.caseIds.map((id) => lib.find((c) => c.id === id)!), {
      'PI-06': { reply: 'Summary: Hello team, thanks.' },
    });
    const out = await submitBatch(run, batch.index, entries, grader, now);
    expect(out.results.some((r) => r.gradedBy === 'claude')).toBe(true);
    expect(out.results.every((r) => !('graderNote' in r))).toBe(true);
  });
});
