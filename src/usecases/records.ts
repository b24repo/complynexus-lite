import type { AppDeps } from '../api/deps';
import { loadRecord } from '../api/helpers';
import { badgeEligibility } from '../domain/badge';
import type { BadgeEligibility } from '../domain/badge';
import { applyRevoke } from '../domain/record';
import type { ReadinessRecord } from '../domain/types';

export async function recordView(deps: AppDeps, recordId: string, owner: string | null): Promise<ReadinessRecord> {
  return loadRecord(deps, recordId, owner);
}

export async function badgeView(
  deps: AppDeps,
  recordId: string,
  owner: string | null,
  base: string,
): Promise<BadgeEligibility & { verifyUrl: string }> {
  const record = await loadRecord(deps, recordId, owner);
  return { ...badgeEligibility(record), verifyUrl: `${base}/verify/${record.recordId}` };
}

export async function setPublic(
  deps: AppDeps,
  recordId: string,
  owner: string | null,
  parseShowTestSummary: () => boolean,
): Promise<ReadinessRecord> {
  const record = await loadRecord(deps, recordId, owner);
  const showTestSummary = parseShowTestSummary(); // after ownership: other founders get 404, never 400
  return deps.repos.records.update({ ...record, showTestSummary, updatedAt: deps.clock.now().toISOString() });
}

/** Admin-only (owner null); the admin-key check stays in the route. */
export async function revokeRecord(deps: AppDeps, recordId: string, reason: string): Promise<ReadinessRecord> {
  const record = await loadRecord(deps, recordId, null);
  return deps.repos.records.update(applyRevoke(record, reason, deps.clock.now()));
}
