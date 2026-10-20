import { describe, expect, it } from 'vitest';
import { ADMIN_KEY, assess, createAgent, setup, testedAgent } from './helpers';
import type { Client } from './helpers';

async function assessedRecord(overrides: Record<string, unknown> = {}) {
  const ctx = await setup();
  const agentId = await createAgent(ctx.app, overrides);
  const a = await assess(ctx.app, agentId);
  return { ...ctx, agentId, recordId: a.body.record.recordId as string };
}
const html = async (app: Client, id: string) => (await app.get(`/verify/${id}`)).text;

describe('verify page', () => {
  it('verify JSON contains no ownerName, prompts or replies', async () => {
    const { app } = await setup();
    const { recordId } = await testedAgent(app);
    const res = await app.get(`/verify/${recordId}.json`);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Mei Chan');
    expect(text).not.toContain('ownerName');
    expect(text).not.toContain('prompt');
    expect(text).not.toContain('reply');
    expect(res.body).toMatchObject({ recordId, status: 'Current', runMode: 'self_run', evidenceLevel: 'self_reported', badge: { eligible: true } });
    expect(res.body.disclaimer).toContain('not certification');
  });
  it("verify HTML for Assessed contains 'Assessed · not yet tested' and #3D3FD6", async () => {
    const { app, recordId } = await assessedRecord();
    const t = await html(app, recordId);
    expect(t).toContain('Assessed · not yet tested');
    expect(t).toContain('#3D3FD6');
    expect(t).toContain('4 must-fix items open from the assessment');
    expect(t).toContain('Safe test · about 6 min');
    expect(t).toContain(`Record ${recordId} · snapshot`);
  });
  it("verify HTML for Current self-run contains 'Evidence: self-reported' and 'Tests self-run by the founder'", async () => {
    const { app } = await setup();
    const { recordId } = await testedAgent(app);
    const t = await html(app, recordId);
    expect(t).toContain('Evidence: self-reported');
    expect(t).toContain('Tests self-run by the founder on 1 Dec 2026 (32 of 46 cases; 14 not tested on this path)');
    expect(t).toContain('Next scheduled re-test by 1 Mar 2027');
    expect(t).toContain('Last test: 32 of 32 run cases passed (self-run) · no must-fix items open');
    expect(t).toContain('1 Dec 2026 · Self-run');
    await app.patch(`/api/records/${recordId}/public`).send({ showTestSummary: false });
    const hidden = await html(app, recordId);
    expect(hidden).not.toContain('Last test:');
    expect(hidden).toContain('Tests self-run by the founder on 1 Dec 2026.');
  });
  it("verify HTML for Re-test due contains 'must re-test by 14 Nov 2026'", async () => {
    const { app, clock } = await setup('2026-10-01T00:00:00Z');
    const { agentId, recordId } = await testedAgent(app);
    clock.set('2026-10-15T00:00:00Z');
    await app.post(`/api/agents/${agentId}/changes`).send({ description: 'x' });
    const t = await html(app, recordId);
    expect(t).toContain('The agent changed on 15 Oct 2026. The company must re-test by 14 Nov 2026 or this record expires.');
    expect(t).toContain('Re-test by');
  });
  it('verify HTML for a missed scheduled re-test explains the schedule', async () => {
    const { app, clock } = await setup('2026-12-01T00:00:00Z');
    const { recordId } = await testedAgent(app);
    clock.set('2027-03-05T00:00:00Z');
    expect(await html(app, recordId)).toContain('The scheduled re-test was due on 1 Mar 2027.');
    clock.set('2027-06-01T00:00:00Z');
    const t = await html(app, recordId);
    expect(t).toContain('The scheduled re-test was missed and it was not re-tested within 30 days, so it expired on 31 Mar 2027.');
  });
  it("verify HTML for Expired contains 'Do not rely on this record'", async () => {
    const { app, clock } = await setup('2026-07-01T00:00:00Z');
    const { agentId, recordId } = await testedAgent(app);
    clock.set('2026-08-03T00:00:00Z');
    await app.post(`/api/agents/${agentId}/changes`).send({ description: 'x' });
    clock.set('2026-09-10T00:00:00Z');
    const t = await html(app, recordId);
    expect(t).toContain('Do not rely on this record');
    expect(t).toContain('The agent changed on 3 Aug 2026 and was not re-tested within 30 days, so it expired on 2 Sep 2026.');
  });
  it("verify HTML for Revoked contains 'cannot be restored'", async () => {
    const { app } = await setup();
    const { recordId } = await testedAgent(app);
    await app.post(`/api/records/${recordId}/revoke`).set('X-Admin-Key', ADMIN_KEY).send({ reason: 'x' });
    const t = await html(app, recordId);
    expect(t).toContain('cannot be restored');
    expect(t).toContain('Revoked by ComplyNexus on 1 Dec 2026.');
  });
  it('verify HTML includes Lexend font link, #595BFF logo and the SHA-256 hash', async () => {
    const { app, recordId } = await assessedRecord();
    const hash = (await app.get(`/api/records/${recordId}`)).body.hash;
    const t = await html(app, recordId);
    expect(t).toContain('family=Lexend');
    expect(t).toContain('#595BFF');
    expect(t).toContain(`SHA-256 ${hash} · compare with the hash printed on the PDF`);
    expect(t).toContain('What does this record mean?');
    expect(t).toContain('This is a governance-readiness record, not certification.');
  });
  it('verify HTML escapes HTML in agent name', async () => {
    const { app, recordId } = await assessedRecord({ name: '<script>alert(1)</script>' });
    const t = await html(app, recordId);
    expect(t).not.toContain('<script>alert(1)</script>');
    expect(t).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('unknown record → 404 HTML and JSON', async () => {
    const { app } = await setup();
    const page = await app.get('/verify/CNL-2026-9999');
    expect(page.status).toBe(404);
    expect(page.headers['content-type']).toContain('text/html');
    const json = await app.get('/verify/CNL-2026-9999.json');
    expect(json.status).toBe(404);
    expect(json.body.error.code).toBe('RECORD_NOT_FOUND');
  });
});

describe('public base url', () => {
  it('shows the default host when PUBLIC_BASE_URL is unset', async () => {
    const { app } = await setup();
    const id = await createAgent(app);
    const a = await assess(app, id);
    const res = await app.get(`/verify/${a.body.record.recordId}`);
    expect(res.text).toContain('verify.complynexus.com');
  });

  it('uses publicBaseUrl on the verify page and the badge verifyUrl', async () => {
    const { app, token } = await setup(undefined, { publicBaseUrl: 'https://staging.example.com' });
    app.set('Authorization', `Bearer ${token}`); // the cookie is Secure here and the test server is plain http
    const id = await createAgent(app);
    const a = await assess(app, id);
    const recordId = a.body.record.recordId as string;
    const page = await app.get(`/verify/${recordId}`);
    expect(page.text).toContain('staging.example.com');
    expect(page.text).not.toContain('verify.complynexus.com');
    const badge = await app.get(`/api/records/${recordId}/badge`);
    expect(badge.body.verifyUrl).toBe(`https://staging.example.com/verify/${recordId}`);
  });
});
