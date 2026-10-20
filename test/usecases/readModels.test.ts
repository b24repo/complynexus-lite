import { describe, expect, it } from 'vitest';
import { setup } from '../api/helpers';
import { agentBody, bookbotAnswers } from '../fixtures/bookbot';
import { agentOverview, createAgent, listAgentsForFounder, submitAssessment } from '../../src/usecases/agents';
import { HttpError } from '../../src/api/errors';
import { startRun } from '../../src/usecases/guided';

const runBody = {
  size: 'essentials',
  attestation: true,
  safety: { testRecipient: true, freshChat: true, unedited: true },
} as const;

describe('usecase read models', () => {
  it('lists only the founder agents, newest first, with their record', async () => {
    const { deps, clock } = await setup();
    const a = await createAgent(deps, 'f1', { ...agentBody, tools: [...agentBody.tools], name: 'first' });
    clock.set('2026-12-02T00:00:00Z');
    const b = await createAgent(deps, 'f1', { ...agentBody, tools: [...agentBody.tools], name: 'second' });
    await createAgent(deps, 'f2', { ...agentBody, tools: [...agentBody.tools], name: 'other' });
    await submitAssessment(deps, a.id, 'f1', () => ({ answers: bookbotAnswers }));

    const list = await listAgentsForFounder(deps, 'f1');
    expect(list.map((i) => i.agent.id)).toEqual([b.id, a.id]);
    expect(list[0]!.record).toBeNull();
    expect(list[1]!.record?.status).toBe('Assessed');

  });

  it('builds an overview with null record/assessment and an active run', async () => {
    const { deps } = await setup();
    const agent = await createAgent(deps, 'f1', { ...agentBody, tools: [...agentBody.tools] });
    const empty = await agentOverview(deps, agent.id, 'f1');
    expect(empty).toMatchObject({ assessment: null, record: null, badge: null, activeRun: null, openItems: [] });

    await submitAssessment(deps, agent.id, 'f1', () => ({ answers: bookbotAnswers }));
    const run = await startRun(deps, agent.id, 'f1', () => runBody);
    const full = await agentOverview(deps, agent.id, 'f1');
    expect(full.assessment).not.toBeNull();
    expect(full.badge).not.toBeNull();
    expect(full.activeRun?.id).toBe(run.id);
  });

  it('hides another founder agent behind a 404', async () => {
    const { deps } = await setup();
    const agent = await createAgent(deps, 'f1', { ...agentBody, tools: [...agentBody.tools] });
    await expect(agentOverview(deps, agent.id, 'f2')).rejects.toBeInstanceOf(HttpError);
  });
});
