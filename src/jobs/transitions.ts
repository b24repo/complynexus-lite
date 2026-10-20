import type { AppDeps } from '../api/deps';
import { addDays } from '../domain/dates';
import { applyTimeTransitions } from '../domain/record';
import type { ReadinessRecord, RecordStatus } from '../domain/types';
import * as templates from '../infra/notify/templates';

export const REMINDER_DAYS = 14;
export const SCANNED_STATUSES: RecordStatus[] = ['Current', 'Re-test due', 'Expired'];
export type EmailKind = 'reminder' | 'retestDue' | 'expired';

export interface TransitionsOptions {
  now: Date;
  dryRun: boolean;
  baseUrl: string;
}

export interface TransitionsSummary {
  dryRun: boolean;
  now: string;
  scanned: number;
  changed: number;
  emailed: number;
  failed: number;
  skipped: number;
  planned: { recordId: string; kind: EmailKind; to: string; status: RecordStatus }[];
}

const PLANNED_CAP = 200;

/**
 * State-based: lazy reads persist transitions without mail, so the job looks at the current state.
 * A marker counts only when it is newer than the current test cycle (lastTestedAt).
 */
export function emailFor(r: ReadinessRecord, now: Date): EmailKind | null {
  const fresh = (m?: string) => !!m && (!r.lastTestedAt || m >= r.lastTestedAt);
  const n = r.notifications ?? {};
  if (r.status === 'Expired') return fresh(n.expired) ? null : 'expired';
  if (r.status === 'Re-test due') return fresh(n.retestDue) ? null : 'retestDue';
  if (r.status === 'Current' && r.nextRetestBy && !fresh(n.reminder)) {
    const windowStart = addDays(r.nextRetestBy, -REMINDER_DAYS);
    if (now.getTime() >= windowStart.getTime()) return 'reminder';
  }
  return null;
}

function content(kind: EmailKind, r: ReadinessRecord, url: string) {
  if (kind === 'expired') return templates.expired(r, url);
  if (kind === 'reminder') return templates.retestReminder(r, r.nextRetestBy!, url);
  return r.retestReason === 'agent_change' ? templates.agentChanged(r, r.retestBy!, url) : templates.retestDueScheduled(r, r.retestBy!, url);
}

export async function runTransitions(deps: AppDeps, opts: TransitionsOptions): Promise<TransitionsSummary> {
  const { now, dryRun, baseUrl } = opts;
  const s: TransitionsSummary = { dryRun, now: now.toISOString(), scanned: 0, changed: 0, emailed: 0, failed: 0, skipped: 0, planned: [] };
  const log = deps.logger.child({ job: 'transitions', dryRun });
  const seen = new Set<string>(); // a record moved Current -> Re-test due reappears in the later scan
  for (const status of SCANNED_STATUSES) {
    const batch = await deps.repos.records.find((r) => r.status === status, { status });
    for (const stored of batch) {
      if (seen.has(stored.recordId)) continue;
      seen.add(stored.recordId);
      s.scanned += 1;
      let record = applyTimeTransitions(stored, now);
      if (record.status !== stored.status) {
        s.changed += 1;
        log.info({ recordId: record.recordId, from: stored.status, to: record.status }, 'transition');
        if (!dryRun) record = await deps.repos.records.update(record); // persist before sending
      }
      const kind = emailFor(record, now);
      if (!kind) continue;
      const agent = await deps.repos.agents.getById(record.agentId);
      const founder = agent ? await deps.repos.founders.getById(agent.founderId) : null;
      if (!founder) {
        s.skipped += 1;
        log.warn({ recordId: record.recordId, kind }, 'no founder for record; skipped');
        continue;
      }
      if (s.planned.length < PLANNED_CAP) s.planned.push({ recordId: record.recordId, kind, to: founder.email, status: record.status });
      if (dryRun) {
        s.emailed += 1;
        continue;
      }
      try {
        await deps.notifier.send({ to: founder.email, ...content(kind, record, `${baseUrl}/verify/${record.recordId}`) });
        await deps.repos.records.update({ ...record, notifications: { ...record.notifications, [kind]: now.toISOString() } });
        s.emailed += 1;
        log.info({ recordId: record.recordId, kind }, 'emailed');
      } catch (err) {
        s.failed += 1;
        log.error({ err, recordId: record.recordId, kind }, 'email failed; marker left unset');
      }
    }
  }
  const { planned: _planned, dryRun: _dryRun, ...counts } = s; // dryRun already bound on the child logger
  log.info(counts, 'transitions job finished');
  return s;
}
