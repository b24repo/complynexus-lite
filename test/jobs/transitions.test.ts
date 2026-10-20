import { describe, expect, it } from 'vitest';
import { recordHash, toSnapshot } from '../../src/domain/hash';
import type { ReadinessRecord } from '../../src/domain/types';
import { NotifyError } from '../../src/infra/notify/notifier';
import type { Message } from '../../src/infra/notify/notifier';
import { emailFor, runTransitions } from '../../src/jobs/transitions';
import { FOUNDER_A, setup, testedAgent } from '../api/helpers';

const BASE = 'https://staging.example.com';

async function env() {
  const s = await setup();
  const { recordId, agentId } = await testedAgent(s.app);
  const run = (iso: string, dryRun = false) => runTransitions(s.deps, { now: new Date(iso), dryRun, baseUrl: BASE });
  const rec = async () => (await s.deps.repos.records.getById(recordId))!;
  const sentCount = () => s.notifier.sent.length;
  return { ...s, recordId, agentId, run, rec, sentCount };
}

describe('transitions job', () => {
  it('emails the scheduled re-test once, with the deadline and verify link', async () => {
    const e = await env();
    const before = e.sentCount();
    const s = await e.run('2027-03-02T00:00:00Z');
    expect(s).toMatchObject({ changed: 1, emailed: 1, failed: 0 });
    const r = await e.rec();
    expect(r.status).toBe('Re-test due');
    expect(r.retestReason).toBe('scheduled');
    expect(r.notifications?.retestDue).toBeDefined();
    const m = e.notifier.sent[before];
    expect(m.to).toBe(FOUNDER_A);
    expect(m.subject).toContain('Re-test due:');
    expect(m.subject).toContain(e.recordId);
    expect(m.text).toContain('31 Mar 2027');
    expect(m.text).toContain(`${BASE}/verify/${e.recordId}`);
  });

  it('is idempotent', async () => {
    const e = await env();
    await e.run('2027-03-02T00:00:00Z');
    const n = e.sentCount();
    const again = await e.run('2027-03-03T00:00:00Z');
    expect(again).toMatchObject({ changed: 0, emailed: 0 });
    expect(e.sentCount()).toBe(n);
  });

  it('expires and sends one expired mail', async () => {
    const e = await env();
    await e.run('2027-03-02T00:00:00Z');
    const n = e.sentCount();
    const s = await e.run('2027-04-01T00:00:00Z');
    expect(s).toMatchObject({ changed: 1, emailed: 1 });
    expect((await e.rec()).status).toBe('Expired');
    expect((await e.rec()).notifications?.expired).toBeDefined();
    expect(e.notifier.sent[n].subject).toContain('Record expired');
    expect((await e.run('2027-04-02T00:00:00Z')).emailed).toBe(0);
    expect(e.sentCount()).toBe(n + 1);
  });

  it('covers the lazy-read gap: a transition persisted by a read still gets its mail', async () => {
    const e = await env();
    e.clock.set('2027-03-02T00:00:00Z');
    const n = e.sentCount();
    expect((await e.app.get(`/api/records/${e.recordId}`)).body.status).toBe('Re-test due');
    expect(e.sentCount()).toBe(n);
    const s = await e.run('2027-03-02T00:00:00Z');
    expect(s).toMatchObject({ changed: 0, emailed: 1 });
  });

  it('dry run writes and sends nothing but reports the plan', async () => {
    const e = await env();
    const n = e.sentCount();
    const s = await e.run('2027-03-02T00:00:00Z', true);
    expect(s).toMatchObject({ dryRun: true, changed: 1, emailed: 1 });
    expect(s.planned).toEqual([{ recordId: e.recordId, kind: 'retestDue', to: FOUNDER_A, status: 'Re-test due' }]);
    const r = await e.rec();
    expect(r.status).toBe('Current');
    expect(r.notifications).toBeUndefined();
    expect(e.sentCount()).toBe(n);
  });

  it('persists the transition on a failed send, leaves the marker unset and retries', async () => {
    const e = await env();
    const real = e.deps.notifier;
    e.deps.notifier = {
      send: async (_m: Message) => {
        throw new NotifyError('boom');
      },
    };
    const s = await e.run('2027-03-02T00:00:00Z');
    expect(s).toMatchObject({ changed: 1, emailed: 0, failed: 1 });
    const r = await e.rec();
    expect(r.status).toBe('Re-test due');
    expect(r.notifications).toBeUndefined();
    e.deps.notifier = real;
    expect(await e.run('2027-03-02T00:00:00Z')).toMatchObject({ emailed: 1, failed: 0 });
  });

  it('keeps markers out of the hash and the public verify output', async () => {
    const e = await env();
    await e.run('2027-03-02T00:00:00Z');
    const r = await e.rec();
    expect(r.notifications).toBeDefined();
    expect(recordHash(toSnapshot(r))).toBe(r.hash);
    const json = await e.anon.get(`/verify/${e.recordId}.json`);
    expect(JSON.stringify(json.body)).not.toContain('notifications');
    expect((await e.anon.get(`/verify/${e.recordId}`)).text).not.toContain('notifications');
  });

  it('sends a reminder 14 days before the re-test, once per cycle', async () => {
    const e = await env();
    expect((await e.run('2027-02-14T00:00:00Z')).emailed).toBe(0);
    const n = e.sentCount();
    expect((await e.run('2027-02-15T00:00:00Z')).emailed).toBe(1);
    expect(e.notifier.sent[n].subject).toContain('1 Mar 2027');
    expect((await e.rec()).notifications?.reminder).toBeDefined();
    expect((await e.run('2027-02-20T00:00:00Z')).emailed).toBe(0);
  });

  it('a re-test makes old markers stale so the next cycle reminds again', async () => {
    const e = await env();
    await e.run('2027-02-15T00:00:00Z');
    const stored = await e.rec();
    // simulate a completed re-test on 2027-03-05 for this record
    const retested: ReadinessRecord = {
      ...stored,
      status: 'Current',
      lastTestedAt: '2027-03-05T00:00:00.000Z',
      nextRetestBy: '2027-06-05T00:00:00.000Z',
    };
    await e.deps.repos.records.update(retested);
    const n = e.sentCount();
    expect((await e.run('2027-05-25T00:00:00Z')).emailed).toBe(1);
    expect(e.notifier.sent[n].subject).toContain('5 Jun 2027');
  });

  it('skips a record whose agent has no founder', async () => {
    const e = await env();
    const r = await e.rec();
    await e.deps.repos.records.update({ ...r, agentId: 'missing-agent' });
    const n = e.sentCount();
    expect(await e.run('2027-03-02T00:00:00Z')).toMatchObject({ skipped: 1, emailed: 0 });
    expect(e.sentCount()).toBe(n);
  });

  it('declaring a change emails once and the job then stays quiet', async () => {
    const e = await env();
    const n = e.sentCount();
    const res = await e.app.post(`/api/agents/${e.agentId}/changes`).send({ description: 'Swapped the model' });
    expect(res.status).toBe(200);
    expect(res.body.record.notifications.retestDue).toBeDefined();
    expect(e.sentCount()).toBe(n + 1);
    expect(e.notifier.sent[n].subject).toContain('Re-test by');
    expect(e.notifier.sent[n].to).toBe(FOUNDER_A);
    expect((await e.run('2026-12-02T00:00:00Z')).emailed).toBe(0);
    expect(e.sentCount()).toBe(n + 1);
  });

  it('a failing notifier does not fail declaring a change; the job sends it later', async () => {
    const e = await env();
    const real = e.deps.notifier;
    e.deps.notifier = {
      send: async () => {
        throw new NotifyError('boom');
      },
    };
    const res = await e.app.post(`/api/agents/${e.agentId}/changes`).send({ description: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe('Re-test due');
    expect(res.body.record.notifications).toBeUndefined();
    e.deps.notifier = real;
    const n = e.sentCount();
    expect((await e.run('2026-12-02T00:00:00Z')).emailed).toBe(1);
    expect(e.notifier.sent[n].subject).toContain('Re-test by');
  });

  it('skips the change email when no safe base URL exists', async () => {
    const e = await env();
    const n = e.sentCount();
    const res = await e.app.post(`/api/agents/${e.agentId}/changes`).set('Host', 'evil.example.com').send({ description: 'x' });
    expect(res.status).toBe(200);
    expect(e.sentCount()).toBe(n);
    expect((await e.run('2026-12-02T00:00:00Z')).emailed).toBe(1);
  });
});

describe('emailFor', () => {
  const base = {
    status: 'Re-test due',
    lastTestedAt: '2027-01-10T00:00:00.000Z',
    nextRetestBy: null,
    retestBy: '2027-03-01T00:00:00.000Z',
  } as unknown as ReadinessRecord;
  const now = new Date('2027-02-01T00:00:00Z');
  it('a fresh marker means nothing to send', () => {
    expect(emailFor({ ...base, notifications: { retestDue: '2027-01-20T00:00:00.000Z' } }, now)).toBeNull();
  });
  it('a marker older than the last test is stale', () => {
    expect(emailFor({ ...base, notifications: { retestDue: '2026-12-20T00:00:00.000Z' } }, now)).toBe('retestDue');
  });
  it('Assessed and Revoked records get nothing', () => {
    expect(emailFor({ ...base, status: 'Assessed' }, now)).toBeNull();
    expect(emailFor({ ...base, status: 'Revoked' }, now)).toBeNull();
  });
});
