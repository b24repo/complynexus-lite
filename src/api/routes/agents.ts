import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter } from '../helpers';
import { founderOf } from '../middleware/auth';
import { AgentBody, AssessmentBody, ChangeBody } from '../schemas';
import { createAgent, declareChange, getAgent, getAssessment, submitAssessment } from '../../usecases/agents';

export function agentRoutes(deps: AppDeps): Router {
  const router = asyncRouter();

  router.post('/', async (req, res) => {
    res.status(201).json(await createAgent(deps, founderOf(res).id, AgentBody.parse(req.body)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await getAgent(deps, req.params.id, founderOf(res).id));
  });

  router.post('/:id/assessment', async (req, res) => {
    res.status(201).json(await submitAssessment(deps, req.params.id, founderOf(res).id, () => AssessmentBody.parse(req.body)));
  });

  router.get('/:id/assessment', async (req, res) => {
    res.json(await getAssessment(deps, req.params.id, founderOf(res).id));
  });

  router.post('/:id/changes', async (req, res) => {
    res.json(await declareChange(deps, req.params.id, founderOf(res).id, () => void ChangeBody.parse(req.body)));
  });

  return router;
}
