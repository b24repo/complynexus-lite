import { describe, expect, it } from 'vitest';
import { canonicalJson, recordHash, toSnapshot } from '../../src/domain/hash';
import { assessmentOpenItems, readinessScore, riskBand } from '../../src/domain/assessment';
import { createAssessedRecord } from '../../src/domain/record';
import { agentFixture, bookbotAnswers } from '../fixtures/bookbot';

function makeRecord() {
  const score = readinessScore(bookbotAnswers);
  const assessment = {
    id: 'a1',
    agentId: agentFixture.id,
    version: 1,
    answers: bookbotAnswers,
    readinessScore: score,
    riskBand: riskBand(score),
    completedAt: '2026-10-10T00:00:00.000Z',
  };
  return createAssessedRecord({
    agent: agentFixture,
    assessment,
    openItems: assessmentOpenItems(bookbotAnswers),
    ids: { recordId: 'CNL-2026-0001' },
    now: new Date('2026-10-10T00:00:00Z'),
  });
}

describe('hash', () => {
  it('canonicalJson sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe('{"a":{"c":[2,1]},"b":1}');
  });
  it('canonicalJson preserves array order', () => {
    expect(canonicalJson(['b', 'a'])).toBe('["b","a"]');
    expect(canonicalJson([undefined, null])).toBe('[null,null]');
  });
  it('recordHash is 64 lowercase hex chars', () => {
    expect(recordHash(toSnapshot(makeRecord()))).toMatch(/^[0-9a-f]{64}$/);
  });
  it('recordHash is identical for key-order permutations of the same snapshot', () => {
    const snap = toSnapshot(makeRecord());
    const reversed = Object.fromEntries(Object.entries(snap).reverse()) as typeof snap;
    expect(recordHash(reversed)).toBe(recordHash(snap));
  });
  it('recordHash changes when readinessScore changes', () => {
    const snap = toSnapshot(makeRecord());
    expect(recordHash({ ...snap, readinessScore: snap.readinessScore + 1 })).not.toBe(recordHash(snap));
  });
  it('recordHash ignores status, retestBy and showTestSummary', () => {
    const r = makeRecord();
    const changed = { ...r, status: 'Expired' as const, retestBy: '2027-01-01', showTestSummary: false };
    expect(recordHash(toSnapshot(changed))).toBe(r.hash);
  });
  it('notification markers do not change the hash', () => {
    const r = makeRecord();
    const marked = { ...r, notifications: { retestDue: '2027-03-02T00:00:00.000Z' } };
    expect(recordHash(toSnapshot(marked))).toBe(r.hash);
    expect(toSnapshot(marked)).not.toHaveProperty('notifications');
  });
});
