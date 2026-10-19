import { CONTROL_SET_VERSION } from './controls';
import { addDays, addMonths, isAfter } from './dates';
import { recordHash, toSnapshot } from './hash';
import { splitOpenItems } from './scoring';
import { DomainError } from './types';
import type {
  Agent,
  Assessment,
  EvidenceLevel,
  GuidedSize,
  OpenItem,
  ReadinessRecord,
  RecordStatus,
  RunMode,
  TestSummary,
} from './types';
import { LIBRARY_VERSION } from '../library/library';

export const GRACE_DAYS = 30;
export const RETEST_MONTHS = 3;

export const TRANSITIONS: Record<RecordStatus, RecordStatus[]> = {
  Assessed: ['Current', 'Revoked'],
  Current: ['Re-test due', 'Current', 'Revoked'],
  'Re-test due': ['Current', 'Expired', 'Revoked'],
  Expired: ['Current', 'Revoked'],
  Revoked: [],
};

export function assertTransition(from: RecordStatus, to: RecordStatus): void {
  if (from === 'Revoked') throw new DomainError('RECORD_REVOKED', 'A revoked record cannot change');
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError('INVALID_TRANSITION', `Cannot move from ${from} to ${to}`);
  }
}

function rehash(r: ReadinessRecord): ReadinessRecord {
  return { ...r, hash: recordHash(toSnapshot(r)) };
}

const iso = (d: Date): string => d.toISOString();

export function createAssessedRecord(input: {
  agent: Agent;
  assessment: Assessment;
  openItems: OpenItem[];
  ids: { recordId: string };
  now: Date;
}): ReadinessRecord {
  const { agent, assessment, openItems, ids, now } = input;
  const { openMustFix, openShouldFix } = splitOpenItems(openItems);
  return rehash({
    id: ids.recordId,
    recordId: ids.recordId,
    version: 1,
    orgName: agent.orgName,
    agentName: agent.name,
    ownerName: agent.ownerName,
    assessedAt: assessment.completedAt,
    lastTestedAt: null,
    runMode: null,
    evidenceLevel: null,
    guidedSize: null,
    readinessScore: assessment.readinessScore,
    riskBand: assessment.riskBand,
    openMustFix,
    openShouldFix,
    testSummary: null,
    libraryVersion: LIBRARY_VERSION,
    controlSetVersion: CONTROL_SET_VERSION,
    agentId: agent.id,
    status: 'Assessed',
    hash: '',
    nextRetestBy: null,
    retestBy: null,
    retestReason: null,
    changedAt: null,
    expiredAt: null,
    revokedAt: null,
    revokeReason: null,
    showTestSummary: true,
    createdAt: iso(now),
    updatedAt: iso(now),
  });
}

export function applyReassessment(
  record: ReadinessRecord,
  input: { assessment: Assessment; openItems: OpenItem[]; now: Date },
): ReadinessRecord {
  if (record.status === 'Revoked') throw new DomainError('RECORD_REVOKED');
  const { openMustFix, openShouldFix } = splitOpenItems(input.openItems);
  return rehash({
    ...record,
    version: record.version + 1,
    assessedAt: input.assessment.completedAt,
    readinessScore: input.assessment.readinessScore,
    riskBand: input.assessment.riskBand,
    openMustFix,
    openShouldFix,
    updatedAt: iso(input.now),
  });
}

export function applyTestCompleted(
  record: ReadinessRecord,
  input: {
    summary: TestSummary;
    openItems: OpenItem[];
    runMode: RunMode;
    evidenceLevel: EvidenceLevel;
    guidedSize: GuidedSize | null;
    now: Date;
  },
): ReadinessRecord {
  assertTransition(record.status, 'Current');
  const { now } = input;
  const { openMustFix, openShouldFix } = splitOpenItems(input.openItems);
  return rehash({
    ...record,
    status: 'Current',
    version: record.version + 1,
    lastTestedAt: iso(now),
    nextRetestBy: iso(addMonths(now, RETEST_MONTHS)),
    retestBy: null,
    retestReason: null,
    changedAt: null,
    expiredAt: null,
    runMode: input.runMode,
    evidenceLevel: input.evidenceLevel,
    guidedSize: input.guidedSize,
    testSummary: input.summary,
    openMustFix,
    openShouldFix,
    updatedAt: iso(now),
  });
}

export function applyAgentChange(record: ReadinessRecord, now: Date): ReadinessRecord {
  if (record.status === 'Revoked') throw new DomainError('RECORD_REVOKED');
  if (record.status === 'Current') {
    assertTransition('Current', 'Re-test due');
    return {
      ...record,
      status: 'Re-test due',
      retestReason: 'agent_change',
      changedAt: iso(now),
      retestBy: iso(addDays(now, GRACE_DAYS)),
      updatedAt: iso(now),
    };
  }
  if (record.status === 'Assessed') {
    return { ...record, changedAt: iso(now), updatedAt: iso(now) };
  }
  return record; // Re-test due / Expired: keep the original change and deadline
}

export function applyTimeTransitions(record: ReadinessRecord, now: Date): ReadinessRecord {
  let r = record;
  if (r.status === 'Current' && r.nextRetestBy && isAfter(now, r.nextRetestBy)) {
    assertTransition('Current', 'Re-test due');
    r = {
      ...r,
      status: 'Re-test due',
      retestReason: 'scheduled',
      retestBy: iso(addDays(r.nextRetestBy, GRACE_DAYS)),
      updatedAt: iso(now),
    };
  }
  if (r.status === 'Re-test due' && r.retestBy && isAfter(now, r.retestBy)) {
    assertTransition('Re-test due', 'Expired');
    r = { ...r, status: 'Expired', expiredAt: r.retestBy, updatedAt: iso(now) };
  }
  return r;
}

export function applyRevoke(record: ReadinessRecord, reason: string, now: Date): ReadinessRecord {
  assertTransition(record.status, 'Revoked');
  return { ...record, status: 'Revoked', revokedAt: iso(now), revokeReason: reason, updatedAt: iso(now) };
}
