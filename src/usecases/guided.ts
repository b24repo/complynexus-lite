import type { AppDeps } from '../api/deps';
import { HttpError } from '../api/errors';
import { currentOpenItems, latestAssessment, loadRecord, recordForAgent, requireAgent, requireRun, saveNewVersion } from '../api/helpers';
import type { BatchInput, GuidedRunInput } from '../api/schemas';
import { applyTestCompleted } from '../domain/record';
import { testOpenItems } from '../domain/scoring';
import { DomainError } from '../domain/types';
import type { CaseResult, GuidedRun, OpenItem, ReadinessRecord, TestSummary } from '../domain/types';
import { runSummary, startGuidedRun, submitBatch } from '../guided/engine';
import { getCase, loadLibrary } from '../library/library';

export type ExpandedBatch = GuidedRun['batches'][number] & {
  cases: { id: string; name: string; type: string; prompt: string }[];
};
export type ExpandedRun = Omit<GuidedRun, 'batches'> & { batches: ExpandedBatch[] };

export const expandBatch = (b: GuidedRun['batches'][number]): ExpandedBatch => ({
  ...b,
  cases: b.caseIds.map((id) => {
    const c = getCase(id);
    return { id: c.id, name: c.name, type: c.type, prompt: c.prompt };
  }),
});

export const expandRun = (run: GuidedRun): ExpandedRun => ({ ...run, batches: run.batches.map(expandBatch) });

export async function startRun(deps: AppDeps, agentId: string, owner: string | null, parseInput: () => GuidedRunInput): Promise<GuidedRun> {
  const agent = await requireAgent(deps, agentId, owner);
  const input = parseInput(); // after ownership: other founders get 404, never 400
  const assessment = await latestAssessment(deps, agent.id);
  if (!assessment) throw new DomainError('ASSESSMENT_REQUIRED');
  const existing = await recordForAgent(deps, agent.id);
  if (existing?.status === 'Revoked') throw new DomainError('RECORD_REVOKED');
  const runNumber = (await deps.repos.runs.find((r) => r.agentId === agent.id, { agentId: agent.id })).length + 1;
  const run = startGuidedRun({ agent, size: input.size, runNumber, now: deps.clock.now(), library: loadLibrary() });
  await deps.repos.runs.insert(run);
  return run;
}

export async function runView(deps: AppDeps, runId: string, owner: string | null): Promise<ExpandedRun> {
  return expandRun(await requireRun(deps, runId, owner));
}

export interface BatchOutcome {
  run: ExpandedRun;
  batchResults: CaseResult[];
  nextBatch: ExpandedBatch | null;
  record?: ReadinessRecord;
}

export async function submitRunBatch(
  deps: AppDeps,
  runId: string,
  owner: string | null,
  index: number,
  parseEntries: () => BatchInput['entries'],
): Promise<BatchOutcome> {
  const run = await requireRun(deps, runId, owner);
  const entries = parseEntries(); // after ownership: other founders get 404, never 400
  const now = deps.clock.now();
  const updated = await submitBatch(run, index, entries, deps.grader, now);
  const batch = updated.batches.find((b) => b.index === index)!;
  const batchResults = updated.results.filter((r) => batch.caseIds.includes(r.caseId));

  let record: ReadinessRecord | null = null;
  if (updated.status === 'completed') {
    const stored = await recordForAgent(deps, run.agentId);
    if (!stored) throw new HttpError(404, 'RECORD_NOT_FOUND');
    const current = await loadRecord(deps, stored.recordId, owner);
    const assessment = (await latestAssessment(deps, run.agentId))!;
    const library = loadLibrary();
    const openItems = await currentOpenItems(deps, assessment, updated);
    record = applyTestCompleted(current, {
      summary: runSummary(updated, library),
      openItems,
      runMode: 'self_run',
      evidenceLevel: 'self_reported',
      guidedSize: updated.size,
      now,
    });
    await saveNewVersion(deps, record, 'update');
  }
  await deps.repos.runs.update(updated);
  const next = updated.batches.find((b) => !b.savedAt);
  return { run: expandRun(updated), batchResults, nextBatch: next ? expandBatch(next) : null, ...(record ? { record } : {}) };
}

export interface ResultsView {
  summary: TestSummary;
  failedCases: { id: string; name: string; category: string; controlId: string; severity: string; reason: string }[];
  notRun: { category: string; count: number; reasons: string[] }[];
  openItems: OpenItem[];
  runMode: 'self_run';
  evidenceLevel: 'self_reported';
  run: GuidedRun;
}

export async function resultsView(deps: AppDeps, runId: string, owner: string | null): Promise<ResultsView> {
  const run = await requireRun(deps, runId, owner);
  const library = loadLibrary();
  const assessment = await latestAssessment(deps, run.agentId);
  const summary = runSummary(run, library);
  const failedCases = run.results
    .filter((r) => r.verdict === 'fail')
    .map((r) => {
      const c = getCase(r.caseId);
      return { id: c.id, name: c.name, category: c.category, controlId: c.controlId, severity: c.severity, reason: r.reason };
    });
  const notRun = summary.byCategory
    .filter((c) => c.notRun > 0)
    .map((c) => ({
      category: c.category,
      count: c.notRun,
      reasons: [
        ...new Set(
          run.results
            .filter((r) => r.verdict === 'not_run' && getCase(r.caseId).category === c.category)
            .map((r) => r.reason),
        ),
      ],
    }));
  const openItems = assessment ? await currentOpenItems(deps, assessment, run) : testOpenItems(run.results, library);
  return { summary, failedCases, notRun, openItems, runMode: 'self_run', evidenceLevel: 'self_reported', run };
}
