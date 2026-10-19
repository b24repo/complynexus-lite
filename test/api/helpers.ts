import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/api/app';
import type { AppDeps } from '../../src/api/deps';
import { getCase } from '../../src/library/library';
import { RuleBasedGrader } from '../../src/grading/ruleBased';
import { FixedClock } from '../../src/infra/clock';
import { InMemoryRecordIdSource } from '../../src/infra/ids';
import { InMemoryRepository } from '../../src/infra/repo/inMemory';
import { agentBody, allInPlaceAnswers, bookbotAnswers } from '../fixtures/bookbot';
import { entriesFor } from '../fixtures/replies';
import type { Entry } from '../fixtures/replies';

export const ADMIN_KEY = 'test-admin-key';

export function setup(start = '2026-12-01T00:00:00Z') {
  const clock = new FixedClock(start);
  const deps: AppDeps = {
    repos: {
      agents: new InMemoryRepository(),
      assessments: new InMemoryRepository(),
      runs: new InMemoryRepository(),
      records: new InMemoryRepository(),
    },
    recordIds: new InMemoryRecordIdSource(),
    clock,
    grader: new RuleBasedGrader(),
    adminKey: ADMIN_KEY,
  };
  const app: Application = createApp(deps);
  return { app, clock, deps };
}

export async function createAgent(app: Application, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app).post('/api/agents').send({ ...agentBody, ...overrides });
  return res.body.id as string;
}

export async function assess(app: Application, agentId: string, answers = bookbotAnswers) {
  return request(app).post(`/api/agents/${agentId}/assessment`).send({ answers });
}

export const cleanAnswers = allInPlaceAnswers;

export async function startRun(app: Application, agentId: string, size: 'essentials' | 'full' = 'full') {
  return request(app)
    .post(`/api/agents/${agentId}/guided-runs`)
    .send({ size, attestation: true, safety: { testRecipient: true, freshChat: true, unedited: true } });
}

/** Submits every batch of a run with compliant replies plus overrides, returns the last response body. */
export async function completeRun(app: Application, runId: string, overrides: Record<string, Partial<Entry>> = {}) {
  const run = (await request(app).get(`/api/guided-runs/${runId}`)).body;
  let last = null;
  for (const b of run.batches) {
    const res = await request(app)
      .post(`/api/guided-runs/${runId}/batches/${b.index}`)
      .send({ entries: entriesFor(b.cases.map((c: { id: string }) => getCase(c.id)), overrides) });
    last = res;
    if (res.status !== 200) return res;
  }
  return last!;
}

/** Agent + assessment + completed full run. Returns ids. */
export async function testedAgent(app: Application, answers = cleanAnswers, overrides: Record<string, Partial<Entry>> = {}) {
  const agentId = await createAgent(app);
  const a = await assess(app, agentId, answers);
  const recordId = a.body.record.recordId as string;
  const run = (await startRun(app, agentId)).body;
  const done = await completeRun(app, run.id, overrides);
  return { agentId, recordId, runId: run.id as string, done };
}
