import { describe, expect, it } from 'vitest';
import { badgeEligibility } from '../../src/domain/badge';
import type { ReadinessRecord, RecordStatus } from '../../src/domain/types';

const rec = (status: RecordStatus, openMustFix: string[] = []) => ({ status, openMustFix }) as ReadinessRecord;

describe('badge eligibility', () => {
  it('eligible when status Current and no open must-fix', () => {
    expect(badgeEligibility(rec('Current')).eligible).toBe(true);
  });
  it('not eligible when Current with open must-fix (lists ids)', () => {
    const b = badgeEligibility(rec('Current', ['PE-2', 'LA-2']));
    expect(b.eligible).toBe(false);
    expect(b.checks.noOpenMustFix).toEqual({ ok: false, openIds: ['PE-2', 'LA-2'] });
  });
  it('not eligible when Re-test due even with zero must-fix', () => {
    const b = badgeEligibility(rec('Re-test due'));
    expect(b.eligible).toBe(false);
    expect(b.checks.statusCurrent).toEqual({ ok: false, status: 'Re-test due' });
  });
  it('not eligible for Assessed, Expired, Revoked', () => {
    for (const s of ['Assessed', 'Expired', 'Revoked'] as RecordStatus[]) {
      expect(badgeEligibility(rec(s)).eligible).toBe(false);
    }
  });
  it("badge text is 'AI agent tested · Verify'", () => {
    expect(badgeEligibility(rec('Current')).text).toBe('AI agent tested · Verify');
  });
});
