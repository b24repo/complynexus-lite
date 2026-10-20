import pino from 'pino';
import request from 'supertest';
import http from 'node:http';
import { onTestFinished } from 'vitest';
import { createApp } from '../../src/api/app';
import { DEFAULT_AUTH } from '../../src/api/deps';
import type { AppDeps } from '../../src/api/deps';
import { getCase } from '../../src/library/library';
import { RuleBasedGrader } from '../../src/grading/ruleBased';
import { FixedClock } from '../../src/infra/clock';
import { InMemoryRecordIdSource } from '../../src/infra/ids';
import { NoopNotifier } from '../../src/infra/notify/notifier';
import { InMemoryLoginTokenStore, InMemoryRepository } from '../../src/infra/repo/inMemory';
import { agentBody, allInPlaceAnswers, bookbotAnswers } from '../fixtures/bookbot';
import { entriesFor } from '../fixtures/replies';
import type { Entry } from '../fixtures/replies';

export const ADMIN_KEY = 'test-admin-key';
export const FOUNDER_A = 'founder-a@example.com';
export const FOUNDER_B = 'founder-b@example.com';

/** A supertest agent that keeps cookies between requests. */
export type Client = ReturnType<typeof request.agent>;

/** Signs in through the real magic-link flow and returns a cookie-keeping client plus the session token. */
export async function signIn(server: http.Server, notifier: NoopNotifier, email = FOUNDER_A) {
  const client = request.agent(server);
  await client.post('/auth/magic-link').send({ email }).expect(202);
  const link = notifier.sent.at(-1)!.text.match(/https?:\/\/\S+/)![0];
  const u = new URL(link);
  const cb = await client.get(u.pathname + u.search).expect(303);
  const token = /cnl_session=([^;]+)/.exec(String(cb.headers['set-cookie']))![1];
  return { client, token, bearer: { Authorization: `Bearer ${token}` } };
}

/**
 * Binds one server to 127.0.0.1 per test. Passing a bare Express app makes supertest listen on the
 * wildcard address per request, and the kernel can hand it an ephemeral port already owned by another
 * local process on 127.0.0.1, so requests hang or hit the wrong service.
 */
export async function setup(start = '2026-12-01T00:00:00Z', overrides: Partial<AppDeps> = {}) {
  const clock = new FixedClock(start);
  const notifier = new NoopNotifier();
  const deps: AppDeps = {
    repos: {
      agents: new InMemoryRepository(),
      assessments: new InMemoryRepository(),
      runs: new InMemoryRepository(),
      records: new InMemoryRepository(),
      recordVersions: new InMemoryRepository(),
      founders: new InMemoryRepository(),
      loginTokens: new InMemoryLoginTokenStore(),
      sessions: new InMemoryRepository(),
    },
    recordIds: new InMemoryRecordIdSource(),
    clock,
    grader: new RuleBasedGrader(),
    notifier,
    adminKey: ADMIN_KEY,
    csrfSecret: 'test-csrf-secret',
    logger: pino({ level: 'silent' }),
    // Long sessions so the time-travelling record tests (months ahead) stay signed in; auth.test.ts overrides this.
    auth: { ...DEFAULT_AUTH, sessionTtlMs: 10 * 365 * 24 * 3600_000 },
    ...overrides,
  };
  const server = http.createServer(createApp(deps));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  onTestFinished(
    () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  );
  const { client: app, token } = await signIn(server, notifier);
  const anon = request.agent(server);
  return { app, anon, server, token, clock, deps, notifier, signIn: (email: string) => signIn(server, notifier, email) };
}

export async function createAgent(app: Client, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await app.post('/api/agents').send({ ...agentBody, ...overrides });
  return res.body.id as string;
}

export async function assess(app: Client, agentId: string, answers = bookbotAnswers) {
  return app.post(`/api/agents/${agentId}/assessment`).send({ answers });
}

export const cleanAnswers = allInPlaceAnswers;

export async function startRun(app: Client, agentId: string, size: 'essentials' | 'full' = 'full') {
  return app
    .post(`/api/agents/${agentId}/guided-runs`)
    .send({ size, attestation: true, safety: { testRecipient: true, freshChat: true, unedited: true } });
}

/** Submits every batch of a run with compliant replies plus overrides, returns the last response body. */
export async function completeRun(app: Client, runId: string, overrides: Record<string, Partial<Entry>> = {}) {
  const run = (await app.get(`/api/guided-runs/${runId}`)).body;
  let last = null;
  for (const b of run.batches) {
    const res = await app
      .post(`/api/guided-runs/${runId}/batches/${b.index}`)
      .send({ entries: entriesFor(b.cases.map((c: { id: string }) => getCase(c.id)), overrides) });
    last = res;
    if (res.status !== 200) return res;
  }
  return last!;
}

/** Agent + assessment + completed full run. Returns ids. */
export async function testedAgent(app: Client, answers = cleanAnswers, overrides: Record<string, Partial<Entry>> = {}) {
  const agentId = await createAgent(app);
  const a = await assess(app, agentId, answers);
  const recordId = a.body.record.recordId as string;
  const run = (await startRun(app, agentId)).body;
  const done = await completeRun(app, run.id, overrides);
  return { agentId, recordId, runId: run.id as string, done };
}
