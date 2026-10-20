import type { AppDeps } from '../api/deps';
import { HttpError } from '../api/errors';
import { currentOpenItems, latestAssessment, latestCompletedRun, loadRecord, recordForAgent, requireAgent } from '../api/helpers';
import type { AgentInput, AssessmentInput } from '../api/schemas';
import { countByStatus, priorityLabel, readinessScore, riskBand } from '../domain/assessment';
import { badgeEligibility } from '../domain/badge';
import type { BadgeEligibility } from '../domain/badge';
import { CONTROLS, getControl } from '../domain/controls';
import { applyAgentChange, applyReassessment, createAssessedRecord } from '../domain/record';
import type { Agent, Assessment, ControlStatus, GuidedRun, OpenItem, ReadinessRecord } from '../domain/types';
import { uuid } from '../infra/ids';

export interface AssessmentView {
  assessment: Assessment;
  controls: { id: string; name: string; status: ControlStatus; priority: ReturnType<typeof priorityLabel> }[];
  counts: ReturnType<typeof countByStatus>;
  openItems: OpenItem[];
  record: ReadinessRecord | null;
}

export async function createAgent(deps: AppDeps, founderId: string, input: AgentInput): Promise<Agent> {
  const agent: Agent = { id: uuid(), founderId, ...input, createdAt: deps.clock.now().toISOString() };
  return deps.repos.agents.insert(agent);
}

export async function getAgent(deps: AppDeps, agentId: string, owner: string | null): Promise<Agent> {
  return requireAgent(deps, agentId, owner);
}

export async function assessmentView(deps: AppDeps, assessment: Assessment): Promise<AssessmentView> {
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
}

export async function submitAssessment(
  deps: AppDeps,
  agentId: string,
  owner: string | null,
  parseInput: () => AssessmentInput,
): Promise<AssessmentView> {
  const agent = await requireAgent(deps, agentId, owner);
  // Validate only after ownership is resolved so other founders' ids stay hidden (404, never 400).
  const { answers } = parseInput();
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
  return assessmentView(deps, assessment);
}

export async function getAssessment(deps: AppDeps, agentId: string, owner: string | null): Promise<AssessmentView> {
  const agent = await requireAgent(deps, agentId, owner);
  const assessment = await latestAssessment(deps, agent.id);
  if (!assessment) throw new HttpError(404, 'ASSESSMENT_NOT_FOUND');
  return assessmentView(deps, assessment);
}

export async function declareChange(
  deps: AppDeps,
  agentId: string,
  owner: string | null,
  validate: () => void = () => undefined,
): Promise<{ agent: Agent; record: ReadinessRecord | null }> {
  const agent = await requireAgent(deps, agentId, owner);
  validate();
  const now = deps.clock.now();
  const existing = await recordForAgent(deps, agent.id);
  let record: ReadinessRecord | null = null;
  if (existing) {
    record = applyAgentChange(existing, now);
    await deps.repos.records.update(record);
  }
  const updated = await deps.repos.agents.update({ ...agent, changedAt: now.toISOString() });
  return { agent: updated, record };
}

export interface AgentListItem {
  agent: Agent;
  record: ReadinessRecord | null;
}

/** Newest first; record status is current (lazy time transitions applied). */
export async function listAgentsForFounder(deps: AppDeps, founderId: string): Promise<AgentListItem[]> {
  const agents = await deps.repos.agents.find((a) => a.founderId === founderId, { founderId });
  agents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Promise.all(
    agents.map(async (agent) => {
      const stored = await recordForAgent(deps, agent.id);
      return { agent, record: stored ? await loadRecord(deps, stored.recordId, founderId) : null };
    }),
  );
}

export interface AgentOverview {
  agent: Agent;
  assessment: Assessment | null;
  record: ReadinessRecord | null;
  openItems: OpenItem[];
  badge: BadgeEligibility | null;
  activeRun: GuidedRun | null;
}

export async function agentOverview(deps: AppDeps, agentId: string, owner: string | null): Promise<AgentOverview> {
  const agent = await requireAgent(deps, agentId, owner);
  const assessment = await latestAssessment(deps, agent.id);
  const stored = await recordForAgent(deps, agent.id);
  const record = stored ? await loadRecord(deps, stored.recordId, owner) : null;
  const openItems = assessment ? await currentOpenItems(deps, assessment, await latestCompletedRun(deps, agent.id)) : [];
  const inProgress = await deps.repos.runs.find((r) => r.agentId === agent.id && r.status === 'in_progress', {
    agentId: agent.id,
    status: 'in_progress',
  });
  const activeRun = inProgress.sort((a, b) => b.runNumber - a.runNumber)[0] ?? null;
  return { agent, assessment, record, openItems, badge: record ? badgeEligibility(record) : null, activeRun };
}
