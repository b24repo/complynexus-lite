import { describe, expect, it } from 'vitest';
import { saveNewVersion, previousHashes } from '../../src/api/helpers';
import { recordHash } from '../../src/domain/hash';
import { agentBody } from '../fixtures/bookbot';
import { getPdf, pdfText } from '../helpers/pdf';
import { assess, createAgent, setup, testedAgent } from './helpers';

const BASE = 'https://staging.example.com';
const verifyJson = async (anon: Awaited<ReturnType<typeof setup>>['anon'], id: string) => (await anon.get(`/verify/${id}.json`)).body;

describe('GET /api/records/:id/pdf', () => {
  it('lets the owner download a PDF whose hash matches the verify JSON', async () => {
    const { app, anon, deps: d } = await setup();
    d.publicBaseUrl = BASE;
    const { recordId } = await testedAgent(app);
    const j = await verifyJson(anon, recordId);
    const res = await getPdf(app, recordId);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${recordId}-v${j.version}.pdf"`);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    const t = pdfText(body);
    expect(t).toContain(`Record ${recordId} · version ${j.version}`);
    expect(t).toContain(`SHA-256 ${j.hash}`);
    expect(t).toContain(`${agentBody.orgName} · ${agentBody.name}`);
    expect(t).toContain('Status at print time: Current');
    expect(t).toContain('Open must-fix: none');
    expect(t).toContain('32 of 32 run cases passed');
    expect(t).toContain(`Verify: ${BASE}/verify/${recordId}`);
    expect(t).toContain('not certification');
    expect(t).toContain('Printed 1 Dec 2026');
    expect(t).not.toContain('Mei Chan');
  });

  it('prints open items with control names for an assessed-only record', async () => {
    const { app, deps: d } = await setup();
    d.publicBaseUrl = BASE;
    const agentId = await createAgent(app);
    const recordId = (await assess(app, agentId)).body.record.recordId as string;
    const res = await getPdf(app, recordId);
    expect(res.headers['content-disposition']).toContain(`${recordId}-v1.pdf`);
    const t = pdfText(res.body as Buffer);
    expect(t).toContain('Status at print time: Assessed');
    expect(t).toContain('Not tested yet');
    expect(t).toMatch(/Open must-fix: [A-Z]+-\d+ · /);
  });

  it('is founder-only: anon 401, other founder 404', async () => {
    const { app, anon, signIn, deps: d } = await setup();
    d.publicBaseUrl = BASE;
    const { recordId } = await testedAgent(app);
    const a = await anon.get(`/api/records/${recordId}/pdf`);
    expect(a.status).toBe(401);
    expect(a.body.error.code ?? a.body.code).toBe('AUTH_REQUIRED');
    const b = await signIn('founder-b@example.com');
    const r = await anon.get(`/api/records/${recordId}/pdf`).set(b.bearer);
    expect(r.status).toBe(404);
  });

  it('keeps the verify hash after expiry', async () => {
    const { app, anon, clock, deps: d } = await setup();
    d.publicBaseUrl = BASE;
    const { recordId } = await testedAgent(app);
    clock.set('2027-04-01T00:00:00Z');
    const j = await verifyJson(anon, recordId);
    expect(j.status).toBe('Expired');
    const t = pdfText((await getPdf(app, recordId)).body as Buffer);
    expect(t).toContain('Status at print time: Expired');
    expect(t).toContain(`SHA-256 ${j.hash}`);
  });

  it('prints hostile names verbatim without throwing', async () => {
    const { app, deps: d } = await setup();
    d.publicBaseUrl = BASE;
    const agentId = await createAgent(app, { name: '<script>alert(1)</script>' });
    const recordId = (await assess(app, agentId)).body.record.recordId as string;
    const res = await getPdf(app, recordId);
    expect(res.status).toBe(200);
    expect(pdfText(res.body as Buffer)).toContain('<script>alert(1)</script>');
  });
});

describe('version history', () => {
  it('appends one row per version at the three producing sites and exposes previousHashes', async () => {
    const { app, anon, deps } = await setup();
    deps.publicBaseUrl = BASE;
    const agentId = await createAgent(app);
    const recordId = (await assess(app, agentId)).body.record.recordId as string;
    const v1 = (await verifyJson(anon, recordId)).hash;
    const rows = () => deps.repos.recordVersions.find(() => true, { recordId });
    expect(await rows()).toHaveLength(1);

    const { startRun, completeRun } = await import('./helpers');
    const run = (await startRun(app, agentId)).body;
    await completeRun(app, run.id);
    const j2 = await verifyJson(anon, recordId);
    expect(j2.version).toBe(2);
    expect(j2.previousHashes).toEqual([v1]);
    const all = (await rows()).sort((a, b) => a.version - b.version);
    expect(all.map((r) => r.id)).toEqual([`${recordId}@1`, `${recordId}@2`]);
    expect(all[0].hash).toBe(v1);
    expect(all[1].hash).toBe(j2.hash);
    for (const r of all) expect(recordHash(r.snapshot)).toBe(r.hash);

    await assess(app, agentId);
    const j3 = await verifyJson(anon, recordId);
    expect(j3.version).toBe(3);
    expect(j3.previousHashes).toEqual([j2.hash, v1]);
    const html = (await anon.get(`/verify/${recordId}`)).text;
    expect(html).toContain('(version 3)');
    expect(html).toContain('Earlier versions: 2');
    expect(html).toContain(j2.hash);
    expect(html).toContain(v1);

    // non-version paths add no rows
    await app.patch(`/api/records/${recordId}/public`).send({ showTestSummary: true });
    await app.post(`/api/agents/${agentId}/changes`).send({ description: 'x' });
    await anon.post(`/api/records/${recordId}/revoke`).set('X-Admin-Key', 'test-admin-key').send({ reason: 'r' });
    expect(await rows()).toHaveLength(3);
  });

  it('does not add rows on time transitions', async () => {
    const { app, deps, clock } = await setup();
    deps.publicBaseUrl = BASE;
    const { recordId } = await testedAgent(app);
    clock.set('2027-04-01T00:00:00Z');
    await app.get(`/api/records/${recordId}`);
    expect(await deps.repos.recordVersions.find(() => true, { recordId })).toHaveLength(2);
  });

  it('saveNewVersion is idempotent on the history row and previousHashes ignores the current version', async () => {
    const { app, deps } = await setup();
    deps.publicBaseUrl = BASE;
    const { recordId } = await testedAgent(app);
    const rec = (await deps.repos.records.getById(recordId))!;
    await saveNewVersion(deps, rec, 'update');
    await saveNewVersion(deps, rec, 'update');
    expect(await deps.repos.recordVersions.find(() => true, { recordId })).toHaveLength(2);
    expect(await previousHashes(deps, rec)).toHaveLength(1);
  });

  it('rethrows non-duplicate history errors', async () => {
    const { app, deps } = await setup();
    deps.publicBaseUrl = BASE;
    const { recordId } = await testedAgent(app);
    const rec = (await deps.repos.records.getById(recordId))!;
    deps.repos.recordVersions.insert = async () => {
      throw new Error('boom');
    };
    await expect(saveNewVersion(deps, rec, 'update')).rejects.toThrow('boom');
  });
});
