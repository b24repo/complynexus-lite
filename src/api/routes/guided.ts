import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter } from '../helpers';
import { HttpError } from '../errors';
import { BatchBody, GuidedRunBody } from '../schemas';
import { currentOpenItems, latestAssessment, loadRecord, recordForAgent, requireAgent } from '../helpers';
import { applyTestCompleted } from '../../domain/record';
import { testOpenItems } from '../../domain/scoring';
import { DomainError } from '../../domain/types';
import type { GuidedRun } from '../../domain/types';
import { runSummary, startGuidedRun, submitBatch } from '../../guided/engine';
import { getCase, loadLibrary } from '../../library/library';

const expandBatch = (b: GuidedRun['batches'][number]) => ({
  ...b,
  cases: b.caseIds.map((id) => {
    const c = getCase(id);
    return { id: c.id, name: c.name, type: c.type, prompt: c.prompt };
  }),
});

const expandRun = (run: GuidedRun) => ({ ...run, batches: run.batches.map(expandBatch) });

export function guidedRoutes(deps: AppDeps): Router {
  const router = asyncRouter();

  router.post('/agents/:id/guided-runs', async (req, res) => {
    const agent = await requireAgent(deps, req.params.id);
    const body = GuidedRunBody.parse(req.body);
    const assessment = await latestAssessment(deps, agent.id);
    if (!assessment) throw new DomainError('ASSESSMENT_REQUIRED');
    const existing = await recordForAgent(deps, agent.id);
    if (existing?.status === 'Revoked') throw new DomainError('RECORD_REVOKED');
    const runNumber = (await deps.repos.runs.find((r) => r.agentId === agent.id)).length + 1;
    const run = startGuidedRun({ agent, size: body.size, runNumber, now: deps.clock.now(), library: loadLibrary() });
    await deps.repos.runs.insert(run);
    res.status(201).json(run);
  });

  const requireRun = async (id: string): Promise<GuidedRun> => {
    const run = await deps.repos.runs.getById(id);
    if (!run) throw new HttpError(404, 'RUN_NOT_FOUND');
    return run;
  };

  router.get('/guided-runs/:runId', async (req, res) => {
    res.json(expandRun(await requireRun(req.params.runId)));
  });

  router.post('/guided-runs/:runId/batches/:index', async (req, res) => {
    const run = await requireRun(req.params.runId);
    const { entries } = BatchBody.parse(req.body);
    const index = Number(req.params.index);
    const now = deps.clock.now();
    const updated = await submitBatch(run, index, entries, deps.grader, now);
    const batch = updated.batches.find((b) => b.index === index)!;
    const batchResults = updated.results.filter((r) => batch.caseIds.includes(r.caseId));

    let record = null;
    if (updated.status === 'completed') {
      const stored = await recordForAgent(deps, run.agentId);
      if (!stored) throw new HttpError(404, 'RECORD_NOT_FOUND');
      const current = await loadRecord(deps, stored.recordId);
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
      await deps.repos.records.update(record);
    }
    await deps.repos.runs.update(updated);
    const next = updated.batches.find((b) => !b.savedAt);
    res.json({ run: expandRun(updated), batchResults, nextBatch: next ? expandBatch(next) : null, ...(record ? { record } : {}) });
  });

  router.get('/guided-runs/:runId/results', async (req, res) => {
    const run = await requireRun(req.params.runId);
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
    const openItems = assessment
      ? await currentOpenItems(deps, assessment, run)
      : testOpenItems(run.results, library);
    res.json({ summary, failedCases, notRun, openItems, runMode: 'self_run', evidenceLevel: 'self_reported' });
  });

  return router;
}
