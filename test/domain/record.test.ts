import { describe, expect, it } from 'vitest';
import { assessmentOpenItems, readinessScore, riskBand } from '../../src/domain/assessment';
import {
  TRANSITIONS,
  applyAgentChange,
  applyReassessment,
  applyRevoke,
  applyTestCompleted,
  applyTimeTransitions,
  assertTransition,
  createAssessedRecord,
} from '../../src/domain/record';
import { splitOpenItems } from '../../src/domain/scoring';
import type { ReadinessRecord, RecordStatus } from '../../src/domain/types';
import { agentFixture, allInPlaceAnswers, bookbotAnswers } from '../fixtures/bookbot';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const summary = { passed: 25, run: 32, notRun: 14, total: 46, byCategory: [], failedCaseIds: [] };

function assessed(answers = bookbotAnswers): ReadinessRecord {
  const score = readinessScore(answers);
  return createAssessedRecord({
    agent: agentFixture,
    assessment: { id: 'a', agentId: agentFixture.id, version: 1, answers, readinessScore: score, riskBand: riskBand(score), completedAt: '2026-10-10T00:00:00.000Z' },
    openItems: assessmentOpenItems(answers),
    ids: { recordId: 'CNL-2026-0142' },
    now: d('2026-10-10'),
  });
}
const tested = (r: ReadinessRecord, when: string) =>
  applyTestCompleted(r, { summary, openItems: [], runMode: 'self_run', evidenceLevel: 'self_reported', guidedSize: 'full', now: d(when) });

describe('record state machine', () => {
  it('createAssessedRecord sets status Assessed, version 1, lastTestedAt null', () => {
    const r = assessed();
    expect(r).toMatchObject({ status: 'Assessed', version: 1, lastTestedAt: null, id: 'CNL-2026-0142' });
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('applyTestCompleted from Assessed sets Current, version 2, nextRetestBy 3 months later', () => {
    const r = tested(assessed(), '2026-10-28');
    expect(r.status).toBe('Current');
    expect(r.version).toBe(2);
    expect(r.nextRetestBy?.slice(0, 10)).toBe('2027-01-28');
    expect(r.lastTestedAt?.slice(0, 10)).toBe('2026-10-28');
  });
  it('applyAgentChange on Current sets Re-test due with retestBy 30 days later', () => {
    const r = applyAgentChange(tested(assessed(), '2026-10-01'), d('2026-10-15'));
    expect(r.status).toBe('Re-test due');
    expect(r.retestReason).toBe('agent_change');
    expect(r.retestBy?.slice(0, 10)).toBe('2026-11-14');
    expect(r.changedAt?.slice(0, 10)).toBe('2026-10-15');
  });
  it('applyAgentChange on Assessed leaves status unchanged', () => {
    const r = applyAgentChange(assessed(), d('2026-10-15'));
    expect(r.status).toBe('Assessed');
    expect(r.changedAt).not.toBeNull();
  });
  it('applyAgentChange on Re-test due keeps the existing retestBy', () => {
    const due = applyAgentChange(tested(assessed(), '2026-10-01'), d('2026-10-15'));
    expect(applyAgentChange(due, d('2026-10-20')).retestBy).toBe(due.retestBy);
  });
  it('applyTimeTransitions moves Current past nextRetestBy to Re-test due (scheduled) with retestBy +30 days', () => {
    const r = applyTimeTransitions(tested(assessed(), '2026-10-28'), d('2027-01-29'));
    expect(r.status).toBe('Re-test due');
    expect(r.retestReason).toBe('scheduled');
    expect(r.retestBy?.slice(0, 10)).toBe('2027-02-27');
  });
  it('applyTimeTransitions leaves Current alone before nextRetestBy', () => {
    expect(applyTimeTransitions(tested(assessed(), '2026-10-28'), d('2027-01-28')).status).toBe('Current');
  });
  it('applyTimeTransitions moves Re-test due past retestBy to Expired with expiredAt = retestBy', () => {
    const due = applyAgentChange(tested(assessed(), '2026-07-01'), d('2026-08-03'));
    const r = applyTimeTransitions(due, d('2026-09-03'));
    expect(r.status).toBe('Expired');
    expect(r.expiredAt?.slice(0, 10)).toBe('2026-09-02');
  });
  it('applyTimeTransitions applies both steps in one call when far in the future', () => {
    const r = applyTimeTransitions(tested(assessed(), '2026-10-28'), d('2028-01-01'));
    expect(r.status).toBe('Expired');
    expect(r.retestReason).toBe('scheduled');
    expect(r.expiredAt).toBe(r.retestBy);
  });
  it('applyTimeTransitions is idempotent', () => {
    const once = applyTimeTransitions(tested(assessed(), '2026-10-28'), d('2027-02-01'));
    expect(applyTimeTransitions(once, d('2027-02-01'))).toEqual(once);
  });
  it('applyTimeTransitions does not change the hash', () => {
    const cur = tested(assessed(), '2026-10-28');
    expect(applyTimeTransitions(cur, d('2028-01-01')).hash).toBe(cur.hash);
  });
  it('applyTestCompleted from Re-test due returns to Current and clears retestBy/changedAt', () => {
    const due = applyAgentChange(tested(assessed(), '2026-10-01'), d('2026-10-15'));
    const r = tested(due, '2026-10-28');
    expect(r).toMatchObject({ status: 'Current', retestBy: null, changedAt: null, retestReason: null, version: 3 });
  });
  it('applyTestCompleted from Expired returns to Current', () => {
    const expired = applyTimeTransitions(tested(assessed(), '2026-10-28'), d('2028-01-01'));
    const r = tested(expired, '2028-01-02');
    expect(r.status).toBe('Current');
    expect(r.expiredAt).toBeNull();
  });
  it('applyRevoke works from every status except Revoked', () => {
    const cur = tested(assessed(), '2026-10-28');
    const states: ReadinessRecord[] = [
      assessed(),
      cur,
      applyAgentChange(cur, d('2026-11-01')),
      applyTimeTransitions(cur, d('2028-01-01')),
    ];
    expect(states.map((s) => s.status)).toEqual(['Assessed', 'Current', 'Re-test due', 'Expired']);
    for (const s of states) {
      const r = applyRevoke(s, 'policy breach', d('2026-12-01'));
      expect(r).toMatchObject({ status: 'Revoked', revokeReason: 'policy breach' });
      expect(r.revokedAt?.slice(0, 10)).toBe('2026-12-01');
    }
  });
  it('no transition leaves Revoked (test, change, reassessment and revoke throw RECORD_REVOKED; time is a no-op)', () => {
    const revoked = applyRevoke(assessed(), 'x', d('2026-12-01'));
    expect(() => tested(revoked, '2026-12-02')).toThrow('RECORD_REVOKED');
    expect(() => applyAgentChange(revoked, d('2026-12-02'))).toThrow('RECORD_REVOKED');
    expect(() => applyRevoke(revoked, 'y', d('2026-12-02'))).toThrow('RECORD_REVOKED');
    const split = splitOpenItems([]);
    expect(() =>
      applyReassessment(revoked, { assessment: { id: 'b', agentId: 'x', version: 2, answers: allInPlaceAnswers, readinessScore: 100, riskBand: 'Low risk', completedAt: 'z' }, openItems: [], now: d('2026-12-02') }),
    ).toThrow('RECORD_REVOKED');
    expect(split.openMustFix).toEqual([]);
    expect(applyTimeTransitions(revoked, d('2030-01-01'))).toEqual(revoked);
  });
  it('each new version changes the hash', () => {
    const v1 = assessed();
    const v2 = tested(v1, '2026-10-28');
    const v3 = tested(v2, '2026-11-28');
    expect(new Set([v1.hash, v2.hash, v3.hash]).size).toBe(3);
  });
  it('applyReassessment bumps version and hash without touching status', () => {
    const cur = tested(assessed(), '2026-10-28');
    const r = applyReassessment(cur, {
      assessment: { id: 'b', agentId: 'x', version: 2, answers: allInPlaceAnswers, readinessScore: 100, riskBand: 'Low risk', completedAt: '2026-11-01T00:00:00.000Z' },
      openItems: [],
      now: d('2026-11-01'),
    });
    expect(r).toMatchObject({ status: 'Current', version: cur.version + 1, readinessScore: 100, openMustFix: [] });
    expect(r.hash).not.toBe(cur.hash);
  });
  it('assertTransition follows the table', () => {
    const all: RecordStatus[] = ['Assessed', 'Current', 'Re-test due', 'Expired', 'Revoked'];
    for (const from of all) {
      for (const to of all) {
        if (from === 'Revoked') expect(() => assertTransition(from, to)).toThrow('RECORD_REVOKED');
        else if (TRANSITIONS[from].includes(to)) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow('INVALID_TRANSITION');
      }
    }
    expect(TRANSITIONS.Revoked).toEqual([]);
  });
});
