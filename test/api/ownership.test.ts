import { describe, expect, it } from 'vitest';
import { toSnapshot } from '../../src/domain/hash';
import { agentBody } from '../fixtures/bookbot';
import { FOUNDER_B, setup, testedAgent } from './helpers';

async function twoFounders() {
  const ctx = await setup();
  const a = await testedAgent(ctx.app);
  const b = await ctx.signIn(FOUNDER_B);
  return { ...ctx, a, b: b.client };
}

describe('per-founder ownership', () => {
  it("returns 404 (never 403) for another founder's agent routes", async () => {
    const { b, a } = await twoFounders();
    const calls = [
      await b.get(`/api/agents/${a.agentId}`),
      await b.post(`/api/agents/${a.agentId}/assessment`).send({ answers: [] }),
      await b.get(`/api/agents/${a.agentId}/assessment`),
      await b.post(`/api/agents/${a.agentId}/changes`).send({ description: 'x' }),
      await b.post(`/api/agents/${a.agentId}/guided-runs`).send({
        size: 'full',
        attestation: true,
        safety: { testRecipient: true, freshChat: true, unedited: true },
      }),
    ];
    for (const r of calls) {
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('AGENT_NOT_FOUND');
    }
  });

  it("returns 404 for another founder's record and leaves it unchanged", async () => {
    const { b, app, a } = await twoFounders();
    const before = (await app.get(`/api/records/${a.recordId}`)).body;
    for (const r of [
      await b.get(`/api/records/${a.recordId}`),
      await b.get(`/api/records/${a.recordId}/badge`),
      await b.patch(`/api/records/${a.recordId}/public`).send({ showTestSummary: !before.showTestSummary }),
    ]) {
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('RECORD_NOT_FOUND');
    }
    expect((await app.get(`/api/records/${a.recordId}`)).body).toEqual(before);
  });

  it("returns 404 for another founder's guided runs", async () => {
    const { b, a } = await twoFounders();
    for (const r of [
      await b.get(`/api/guided-runs/${a.runId}`),
      await b.post(`/api/guided-runs/${a.runId}/batches/1`).send({ entries: [] }),
      await b.get(`/api/guided-runs/${a.runId}/results`),
    ]) {
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('RUN_NOT_FOUND');
    }
  });

  it('stores the creating founder on the agent but keeps it out of the record hash snapshot', async () => {
    const { app, deps, a } = await setup().then(async (c) => ({ ...c, a: await testedAgent(c.app) }));
    const me = (await app.get('/auth/me')).body.founder;
    const agent = await deps.repos.agents.getById(a.agentId);
    expect(agent!.founderId).toBe(me.id);
    const record = (await app.get(`/api/records/${a.recordId}`)).body;
    expect(JSON.stringify(toSnapshot(record))).not.toContain('founderId');
  });

  it('treats an agent without a founderId as not found', async () => {
    const { app, deps } = await setup();
    await deps.repos.agents.insert({ id: 'orphan', ...agentBody, tools: [...agentBody.tools], createdAt: '2026-10-10T00:00:00.000Z' } as never);
    const res = await app.get('/api/agents/orphan');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AGENT_NOT_FOUND');
  });
});
