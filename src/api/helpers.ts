import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AppDeps } from './deps';
import { HttpError } from './errors';
import { applyTimeTransitions } from '../domain/record';
import { mergeOpenItems, testOpenItems } from '../domain/scoring';
import { assessmentOpenItems } from '../domain/assessment';
import type { Agent, Assessment, GuidedRun, OpenItem, ReadinessRecord } from '../domain/types';
import { loadLibrary } from '../library/library';

export async function requireAgent(deps: AppDeps, id: string): Promise<Agent> {
  const agent = await deps.repos.agents.getById(id);
  if (!agent) throw new HttpError(404, 'AGENT_NOT_FOUND');
  return agent;
}

export async function latestAssessment(deps: AppDeps, agentId: string): Promise<Assessment | null> {
  const all = await deps.repos.assessments.find((a) => a.agentId === agentId);
  return all.sort((a, b) => b.version - a.version)[0] ?? null;
}

export async function latestCompletedRun(deps: AppDeps, agentId: string): Promise<GuidedRun | null> {
  const all = await deps.repos.runs.find((r) => r.agentId === agentId && r.status === 'completed');
  return all.sort((a, b) => b.runNumber - a.runNumber)[0] ?? null;
}

export async function recordForAgent(deps: AppDeps, agentId: string): Promise<ReadinessRecord | null> {
  return (await deps.repos.records.find((r) => r.agentId === agentId))[0] ?? null;
}

/** Union of assessment gaps and failed-test controls from the latest completed run. */
export async function currentOpenItems(deps: AppDeps, assessment: Assessment, run: GuidedRun | null): Promise<OpenItem[]> {
  const fromAssessment = assessmentOpenItems(assessment.answers);
  const fromTests = run ? testOpenItems(run.results, loadLibrary()) : [];
  return mergeOpenItems(fromAssessment, fromTests);
}

/** Loads a record and applies lazy time transitions, persisting when they changed it. */
export async function loadRecord(deps: AppDeps, recordId: string): Promise<ReadinessRecord> {
  const stored = await deps.repos.records.getById(recordId);
  if (!stored) throw new HttpError(404, 'RECORD_NOT_FOUND');
  const next = applyTimeTransitions(stored, deps.clock.now());
  if (next.status !== stored.status) await deps.repos.records.update(next);
  return next;
}

/** Express 4 does not catch rejected promises, so wrap every async handler. */
export function asyncRouter(): Router {
  const router = Router();
  for (const method of ['get', 'post', 'patch'] as const) {
    const original = router[method].bind(router) as (path: string, ...h: RequestHandler[]) => Router;
    (router as unknown as Record<string, unknown>)[method] = (path: string, ...handlers: RequestHandler[]) =>
      original(
        path,
        ...handlers.map<RequestHandler>((fn) => (req, res, next) => {
          Promise.resolve(fn(req, res, next)).catch(next);
        }),
      );
  }
  return router;
}
