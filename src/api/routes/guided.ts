import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter } from '../helpers';
import { founderOf } from '../middleware/auth';
import { BatchBody, GuidedRunBody } from '../schemas';
import { resultsView, runView, startRun, submitRunBatch } from '../../usecases/guided';

export function guidedRoutes(deps: AppDeps): Router {
  const router = asyncRouter();

  router.post('/agents/:id/guided-runs', async (req, res) => {
    res.status(201).json(await startRun(deps, req.params.id, founderOf(res).id, GuidedRunBody.parse(req.body)));
  });

  router.get('/guided-runs/:runId', async (req, res) => {
    res.json(await runView(deps, req.params.runId, founderOf(res).id));
  });

  router.post('/guided-runs/:runId/batches/:index', async (req, res) => {
    const { entries } = BatchBody.parse(req.body);
    res.json(await submitRunBatch(deps, req.params.runId, founderOf(res).id, Number(req.params.index), entries));
  });

  router.get('/guided-runs/:runId/results', async (req, res) => {
    const { run: _run, ...body } = await resultsView(deps, req.params.runId, founderOf(res).id);
    res.json(body);
  });

  return router;
}
