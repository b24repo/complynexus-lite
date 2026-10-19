import type { ReadinessRecord, RecordStatus } from './types';

export interface BadgeEligibility {
  eligible: boolean;
  checks: {
    noOpenMustFix: { ok: boolean; openIds: string[] };
    statusCurrent: { ok: boolean; status: RecordStatus };
  };
  text: 'AI agent tested · Verify';
}

export function badgeEligibility(record: ReadinessRecord): BadgeEligibility {
  const noOpenMustFix = { ok: record.openMustFix.length === 0, openIds: [...record.openMustFix] };
  const statusCurrent = { ok: record.status === 'Current', status: record.status };
  return {
    eligible: noOpenMustFix.ok && statusCurrent.ok,
    checks: { noOpenMustFix, statusCurrent },
    text: 'AI agent tested · Verify',
  };
}
