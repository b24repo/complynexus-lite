import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter } from '../helpers';
import { HttpError } from '../errors';
import { AgentBody, AssessmentBody, ChangeBody } from '../schemas';
import { currentOpenItems, latestAssessment, latestCompletedRun, recordForAgent, requireAgent } from '../helpers';
import { countByStatus, priorityLabel, readinessScore, riskBand } from '../../domain/assessment';
import { CONTROLS, getControl } from '../../domain/controls';
import { applyAgentChange, applyReassessment, createAssessedRecord } from '../../domain/record';
import type { Agent, Assessment } from '../../domain/types';
import { uuid } from '../../infra/ids';

export function agentRoutes(deps: AppDeps): Router {
  const router = asyncRouter();

  const assessmentView = async (assessment: Assessment) => {
    const run = await latestCompletedRun(deps, assessment.agentId);
    return {
      assessment,
      controls: CONTROLS.map((c) => {
        const status = assessment.answers.find((a) => a.controlId === c.id)!.status;
        return { id: c.id, name: c.name, status, priority: priorityLabel(getControl(c.id), status) };
      }),
      counts: countByStatus(assessment.answers),
      openItems: await currentOpenItems(deps, assessment, run),
      record: await recordForAgent(deps, assessment.agentId),
    };
  };

  router.post('/', async (req, res) => {
    const body = AgentBody.parse(req.body);
    const agent: Agent = { id: uuid(), ...body, createdAt: deps.clock.now().toISOString() };
    res.status(201).json(await deps.repos.agents.insert(agent));
  });

  router.get('/:id', async (req, res) => {
    res.json(await requireAgent(deps, req.params.id));
  });

  router.post('/:id/assessment', async (req, res) => {
    const agent = await requireAgent(deps, req.params.id);
    const { answers } = AssessmentBody.parse(req.body);
    const score = readinessScore(answers);
    const now = deps.clock.now();
    const previous = await latestAssessment(deps, agent.id);
    const assessment: Assessment = {
      id: uuid(),
      agentId: agent.id,
      version: (previous?.version ?? 0) + 1,
      answers,
      readinessScore: score,
      riskBand: riskBand(score),
      completedAt: now.toISOString(),
    };
    await deps.repos.assessments.insert(assessment);
    const openItems = await currentOpenItems(deps, assessment, await latestCompletedRun(deps, agent.id));
    const existing = await recordForAgent(deps, agent.id);
    if (existing) {
      await deps.repos.records.update(applyReassessment(existing, { assessment, openItems, now }));
    } else {
      const recordId = await deps.recordIds.next(now.getUTCFullYear());
      await deps.repos.records.insert(createAssessedRecord({ agent, assessment, openItems, ids: { recordId }, now }));
    }
    res.status(201).json(await assessmentView(assessment));
  });

  router.get('/:id/assessment', async (req, res) => {
    const agent = await requireAgent(deps, req.params.id);
    const assessment = await latestAssessment(deps, agent.id);
    if (!assessment) throw new HttpError(404, 'ASSESSMENT_NOT_FOUND');
    res.json(await assessmentView(assessment));
  });

  router.post('/:id/changes', async (req, res) => {
    const agent = await requireAgent(deps, req.params.id);
    ChangeBody.parse(req.body);
    const now = deps.clock.now();
    const existing = await recordForAgent(deps, agent.id);
    let record = null;
    if (existing) {
      record = applyAgentChange(existing, now);
      await deps.repos.records.update(record);
    }
    const updated = await deps.repos.agents.update({ ...agent, changedAt: now.toISOString() });
    res.json({ agent: updated, record });
  });

  return router;
}

