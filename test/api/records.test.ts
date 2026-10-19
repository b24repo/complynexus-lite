import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_KEY, assess, createAgent, setup, startRun, completeRun, testedAgent } from './helpers';

describe('records API', () => {
  it('GET record applies time transitions (advance clock 91 days → Re-test due scheduled)', async () => {
    // Start 1 Dec 2026: nextRetestBy is 1 Mar 2027 (90 days), so day 91 is past it.
    const { app, clock } = await setup('2026-12-01T00:00:00Z');
    const { recordId } = await testedAgent(app);
    clock.set('2027-03-02T00:00:00Z');
    const rec = (await request(app).get(`/api/records/${recordId}`)).body;
    expect(rec).toMatchObject({ status: 'Re-test due', retestReason: 'scheduled' });
    expect(rec.retestBy.slice(0, 10)).toBe('2027-03-31');
  });
  it('GET record 121 days later → Expired', async () => {
    const { app, clock } = await setup('2026-12-01T00:00:00Z');
    const { recordId } = await testedAgent(app);
    clock.set('2027-04-01T00:00:00Z');
    const rec = (await request(app).get(`/api/records/${recordId}`)).body;
    expect(rec.status).toBe('Expired');
    expect(rec.expiredAt.slice(0, 10)).toBe('2027-03-31');
    expect((await request(app).get('/api/records/CNL-0000-0000')).status).toBe(404);
  });
  it('POST /changes on Current → Re-test due with retestBy +30 days', async () => {
    const { app, clock } = await setup('2026-10-01T00:00:00Z');
    const { agentId, recordId } = await testedAgent(app);
    clock.set('2026-10-15T00:00:00Z');
    const res = await request(app).post(`/api/agents/${agentId}/changes`).send({ description: 'New model' });
    expect(res.body.record).toMatchObject({ status: 'Re-test due', retestReason: 'agent_change' });
    expect(res.body.record.retestBy.slice(0, 10)).toBe('2026-11-14');
    expect((await request(app).get(`/api/records/${recordId}`)).body.status).toBe('Re-test due');
  });
  it('badge endpoint false with reasons when Re-test due; true after re-test with zero must-fix', async () => {
    const { app } = await setup();
    const { agentId, recordId } = await testedAgent(app);
    const ok = await request(app).get(`/api/records/${recordId}/badge`);
    expect(ok.body.eligible).toBe(true);
    expect(ok.body.verifyUrl).toMatch(new RegExp(`/verify/${recordId}$`));
    await request(app).post(`/api/agents/${agentId}/changes`).send({ description: 'x' });
    const due = (await request(app).get(`/api/records/${recordId}/badge`)).body;
    expect(due.eligible).toBe(false);
    expect(due.checks.statusCurrent).toEqual({ ok: false, status: 'Re-test due' });
    const run = (await startRun(app, agentId)).body;
    await completeRun(app, run.id);
    expect((await request(app).get(`/api/records/${recordId}/badge`)).body.eligible).toBe(true);
  });
  it('badge is not eligible while must-fix items are open', async () => {
    const { app } = await setup();
    const id = await createAgent(app);
    const a = await assess(app, id);
    const b = (await request(app).get(`/api/records/${a.body.record.recordId}/badge`)).body;
    expect(b.checks.noOpenMustFix.ok).toBe(false);
  });
  it('revoke without X-Admin-Key → 403; with key → Revoked; later re-test → 409 RECORD_REVOKED', async () => {
    const { app } = await setup();
    const { agentId, recordId } = await testedAgent(app);
    expect((await request(app).post(`/api/records/${recordId}/revoke`).send({ reason: 'x' })).status).toBe(403);
    expect((await request(app).post(`/api/records/${recordId}/revoke`).set('X-Admin-Key', 'wrong-key-value').send({ reason: 'x' })).status).toBe(403);
    const ok = await request(app).post(`/api/records/${recordId}/revoke`).set('X-Admin-Key', ADMIN_KEY).send({ reason: 'Misleading badge use' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'Revoked', revokeReason: 'Misleading badge use' });
    const again = await startRun(app, agentId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('RECORD_REVOKED');
    expect((await request(app).get(`/api/records/${recordId}`)).status).toBe(200);
  });
  it('revoke is refused when no admin key is configured', async () => {
    const { app, deps } = await setup();
    deps.adminKey = undefined;
    const { recordId } = await testedAgent(app);
    expect((await request(app).post(`/api/records/${recordId}/revoke`).set('X-Admin-Key', ADMIN_KEY).send({ reason: 'x' })).status).toBe(403);
  });
  it('a run started before revoke cannot complete (409 RECORD_REVOKED)', async () => {
    const { app } = await setup();
    const { agentId, recordId } = await testedAgent(app);
    const run = (await startRun(app, agentId)).body;
    await request(app).post(`/api/records/${recordId}/revoke`).set('X-Admin-Key', ADMIN_KEY).send({ reason: 'x' });
    const res = await completeRun(app, run.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RECORD_REVOKED');
  });
  it('PATCH public showTestSummary false hides testSummary in verify JSON', async () => {
    const { app } = await setup();
    const { recordId } = await testedAgent(app);
    expect((await request(app).get(`/verify/${recordId}.json`)).body.testSummary).not.toBeNull();
    const patched = await request(app).patch(`/api/records/${recordId}/public`).send({ showTestSummary: false });
    expect(patched.body.showTestSummary).toBe(false);
    expect((await request(app).get(`/verify/${recordId}.json`)).body.testSummary).toBeNull();
    expect((await request(app).patch(`/api/records/${recordId}/public`).send({ showTestSummary: 'no' })).status).toBe(400);
  });
});
