import { summariseResults } from '../domain/scoring';
import { DomainError } from '../domain/types';
import type { Agent, CaseResult, Category, GuidedRun, GuidedSize, SendNodeAnswer, TestCase, TestSummary } from '../domain/types';
import type { Grader } from '../grading/grader';
import { getCase } from '../library/library';
import { uuid } from '../infra/ids';

export const BATCH_SIZE = 5;
const CATEGORIES: Category[] = ['Prompt injection', 'Data leakage', 'Excessive agency', 'Tool misuse'];

export interface Batch {
  index: number;
  category: Category;
  caseIds: string[];
}
export interface BatchEntry {
  caseId: string;
  reply?: string;
  sendNodeRan?: SendNodeAnswer;
  skipped?: boolean;
}

export function planBatches(cases: TestCase[]): Batch[] {
  const batches: Batch[] = [];
  for (const category of CATEGORIES) {
    const ids = cases.filter((c) => c.category === category).map((c) => c.id);
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push({ index: batches.length + 1, category, caseIds: ids.slice(i, i + BATCH_SIZE) });
    }
  }
  return batches;
}

export function startGuidedRun(input: {
  agent: Agent;
  size: GuidedSize;
  runNumber: number;
  now: Date;
  library: TestCase[];
}): GuidedRun {
  const { agent, size, runNumber, now, library } = input;
  const planned = library.filter((c) => c.guidedRunnable && (size === 'full' || c.essentials));
  const results: CaseResult[] = [];
  for (const c of library) {
    if (!c.guidedRunnable) {
      results.push({
        caseId: c.id,
        verdict: 'not_run',
        reason: `Not run on this path: ${c.notRunReason ?? 'not guided-runnable'}`,
        gradedBy: 'none',
      });
    } else if (!planned.includes(c)) {
      results.push({ caseId: c.id, verdict: 'not_run', reason: 'Not in Essentials set', gradedBy: 'none' });
    }
  }
  return {
    id: uuid(),
    agentId: agent.id,
    runNumber,
    size,
    batches: planBatches(planned),
    results,
    status: 'in_progress',
    startedAt: now.toISOString(),
  };
}

export async function submitBatch(
  run: GuidedRun,
  index: number,
  entries: BatchEntry[],
  grader: Grader,
  now: Date,
): Promise<GuidedRun> {
  const next = run.batches.find((b) => !b.savedAt);
  const batch = run.batches.find((b) => b.index === index);
  if (!batch || !next || next.index !== index) throw new DomainError('BATCH_OUT_OF_ORDER');
  const ids = entries.map((e) => e.caseId);
  const exact =
    ids.length === batch.caseIds.length &&
    new Set(ids).size === ids.length &&
    batch.caseIds.every((id) => ids.includes(id));
  if (!exact) throw new DomainError('INVALID_BATCH');

  const graded: CaseResult[] = [];
  for (const caseId of batch.caseIds) {
    const entry = entries.find((e) => e.caseId === caseId) as BatchEntry;
    if (entry.skipped) {
      graded.push({ caseId, verdict: 'not_run', reason: 'Skipped by founder', gradedBy: 'none' });
      continue;
    }
    const g = await grader.grade(getCase(caseId), { reply: entry.reply ?? '', sendNodeRan: entry.sendNodeRan });
    graded.push({
      caseId,
      verdict: g.verdict,
      reason: g.reason,
      redactedReply: g.redactedReply,
      sendNodeRan: entry.sendNodeRan,
      gradedBy: g.gradedBy,
    });
  }

  const batches = run.batches.map((b) => (b.index === index ? { ...b, savedAt: now.toISOString() } : b));
  const done = batches.every((b) => b.savedAt);
  return {
    ...run,
    batches,
    results: [...run.results, ...graded],
    status: done ? 'completed' : 'in_progress',
    completedAt: done ? now.toISOString() : undefined,
  };
}

export function runSummary(run: GuidedRun, library: TestCase[]): TestSummary {
  return summariseResults(run.results, library);
}
