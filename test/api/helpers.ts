import request from 'supertest';
import http from 'node:http';
import { onTestFinished } from 'vitest';
import { createApp } from '../../src/api/app';
import type { AppDeps } from '../../src/api/deps';
import { getCase } from '../../src/library/library';
import { RuleBasedGrader } from '../../src/grading/ruleBased';
import { FixedClock } from '../../src/infra/clock';
import { InMemoryRepository } from '../../src/infra/repo/inMemory';
import { agentBody, allInPlaceAnswers, bookbotAnswers } from '../fixtures/bookbot';
import { entriesFor } from '../fixtures/replies';
import type { Entry } from '../fixtures/replies';

export const ADMIN_KEY = 'test-admin-key';

/**
 * Binds one server to 127.0.0.1 per test. Passing a bare Express app makes supertest listen on the
 * wildcard address per request, and the kernel can hand it an ephemeral port already owned by another
 * local process on 127.0.0.1, so requests hang or hit the wrong service.
 */
export async function setup(start = '2026-12-01T00:00:00Z') {
  const clock = new FixedClock(start);
  const deps: AppDeps = {
    repos: {
      agents: new InMemoryRepository(),
      assessments: new InMemoryRepository(),
      runs: new InMemoryRepository(),
      records: new InMemoryRepository(),
    },
    clock,
    grader: new RuleBasedGrader(),
    adminKey: ADMIN_KEY,
  };
  const app = http.createServer(createApp(deps));
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  onTestFinished(() => new Promise<void>((r) => app.close(() => r())));
  return { app, clock, deps };
}

export async function createAgent(app: http.Server, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app).post('/api/agents').send({ ...agentBody, ...overrides });
  return res.body.id as string;
}

export async function assess(app: http.Server, agentId: string, answers = bookbotAnswers) {
  return request(app).post(`/api/agents/${agentId}/assessment`).send({ answers });
}

export const cleanAnswers = allInPlaceAnswers;

export async function startRun(app: http.Server, agentId: string, size: 'essentials' | 'full' = 'full') {
  return request(app)
    .post(`/api/agents/${agentId}/guided-runs`)
    .send({ size, attestation: true, safety: { testRecipient: true, freshChat: true, unedited: true } });
}

/** Submits every batch of a run with compliant replies plus overrides, returns the last response body. */
export async function completeRun(app: http.Server, runId: string, overrides: Record<string, Partial<Entry>> = {}) {
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
export async function testedAgent(app: http.Server, answers = cleanAnswers, overrides: Record<string, Partial<Entry>> = {}) {
  const agentId = await createAgent(app);
  const a = await assess(app, agentId, answers);
  const recordId = a.body.record.recordId as string;
  const run = (await startRun(app, agentId)).body;
  const done = await completeRun(app, run.id, overrides);
  return { agentId, recordId, runId: run.id as string, done };
}
