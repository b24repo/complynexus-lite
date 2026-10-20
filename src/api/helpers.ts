import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { AppDeps } from './deps';
import { HttpError } from './errors';
import { applyTimeTransitions } from '../domain/record';
import { mergeOpenItems, testOpenItems } from '../domain/scoring';
import { assessmentOpenItems } from '../domain/assessment';
import type { Agent, Assessment, GuidedRun, OpenItem, ReadinessRecord } from '../domain/types';
import { loadLibrary } from '../library/library';

/** `owner` null means public/admin access (no ownership check). Another founder's agent is a 404, never a 403. */
export async function requireAgent(deps: AppDeps, id: string, owner: string | null): Promise<Agent> {
  const agent = await deps.repos.agents.getById(id);
  if (!agent || (owner !== null && agent.founderId !== owner)) throw new HttpError(404, 'AGENT_NOT_FOUND');
  return agent;
}

export async function ownsAgent(deps: AppDeps, agentId: string, owner: string | null): Promise<boolean> {
  if (owner === null) return true;
  const agent = await deps.repos.agents.getById(agentId);
  return !!agent && agent.founderId === owner;
}

export async function latestAssessment(deps: AppDeps, agentId: string): Promise<Assessment | null> {
  const all = await deps.repos.assessments.find((a) => a.agentId === agentId, { agentId });
  return all.sort((a, b) => b.version - a.version)[0] ?? null;
}

export async function latestCompletedRun(deps: AppDeps, agentId: string): Promise<GuidedRun | null> {
  const all = await deps.repos.runs.find((r) => r.agentId === agentId && r.status === 'completed', { agentId, status: 'completed' });
  return all.sort((a, b) => b.runNumber - a.runNumber)[0] ?? null;
}

export async function recordForAgent(deps: AppDeps, agentId: string): Promise<ReadinessRecord | null> {
  return (await deps.repos.records.find((r) => r.agentId === agentId, { agentId }))[0] ?? null;
}

/** Union of assessment gaps and failed-test controls from the latest completed run. */
export async function currentOpenItems(deps: AppDeps, assessment: Assessment, run: GuidedRun | null): Promise<OpenItem[]> {
  const fromAssessment = assessmentOpenItems(assessment.answers);
  const fromTests = run ? testOpenItems(run.results, loadLibrary()) : [];
  return mergeOpenItems(fromAssessment, fromTests);
}

/** Loads a record and applies lazy time transitions, persisting when they changed it. */
export async function loadRecord(deps: AppDeps, recordId: string, owner: string | null): Promise<ReadinessRecord> {
  const stored = await deps.repos.records.getById(recordId);
  if (!stored || !(await ownsAgent(deps, stored.agentId, owner))) throw new HttpError(404, 'RECORD_NOT_FOUND');
  const next = applyTimeTransitions(stored, deps.clock.now());
  if (next.status !== stored.status) await deps.repos.records.update(next);
  return next;
}

/**
 * Origin for links in emails, badges and pages. Never trusts the Host header in production;
 * elsewhere only for local dev hosts. Returns null when no safe origin exists.
 */
export function resolveBaseUrl(deps: AppDeps, req: Request): string | null {
  if (deps.publicBaseUrl) return deps.publicBaseUrl;
  const host = req.get('host') ?? '';
  if (!deps.production && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `${req.protocol}://${host}`;
  return null;
}

/** Like resolveBaseUrl but throws 500 PUBLIC_BASE_URL_REQUIRED when none is safe. */
export function baseUrl(deps: AppDeps, req: Request): string {
  const base = resolveBaseUrl(deps, req);
  if (base) return base;
  deps.logger.error({ host: req.get('host') }, 'PUBLIC_BASE_URL is required to build links');
  throw new HttpError(500, 'PUBLIC_BASE_URL_REQUIRED');
}

export async function requireRun(deps: AppDeps, runId: string, owner: string | null): Promise<GuidedRun> {
  const run = await deps.repos.runs.getById(runId);
  if (!run || !(await ownsAgent(deps, run.agentId, owner))) throw new HttpError(404, 'RUN_NOT_FOUND');
  return run;
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
