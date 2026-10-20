import { describe, expect, it } from 'vitest';
import { ADMIN_KEY, assess, completeRun, createAgent, setup, startRun } from '../api/helpers';
import { CONTROLS } from '../../src/domain/controls';
import { allInPlaceAnswers, bookbotAnswers } from '../fixtures/bookbot';
import { createAgentViaForm, csrfOf, postForm } from './helpers';

const XSS = '<script>alert(1)</script>';
const answersBody = (answers = allInPlaceAnswers) => Object.fromEntries(answers.map((a) => [a.controlId, a.status]));
const runBody = (csrf: string, extra: Record<string, unknown> = {}) => ({
  _csrf: csrf,
  size: 'essentials',
  attestation: 'on',
  testRecipient: 'on',
  freshChat: 'on',
  unedited: 'on',
  ...extra,
});

async function csrfFor(client: { get: (p: string) => Promise<{ text: string }> }): Promise<string> {
  return csrfOf((await client.get('/app/agents/new')).text);
}

describe('assessment page', () => {
  it('renders every control, group headings, radios and csrf; pre-fills after an assessment', async () => {
    const { app } = await setup();
    const id = await createAgentViaForm(app);
    const html = (await app.get(`/app/agents/${id}/assessment`).expect(200)).text;
    for (const c of CONTROLS) expect(html).toContain(`name="${c.id}"`);
    expect(html).toContain('Accountability');
    expect(html).toContain('Least agency');
    expect(html).toContain('Partly in place');
    expect(html).toContain('(critical)');
    expect(html).toContain('name="_csrf"');
    expect(html).not.toContain(' checked');

    await assess(app, id, bookbotAnswers);
    const again = (await app.get(`/app/agents/${id}/assessment`)).text;
    expect(again).toMatch(/name="PE-2" value="Missing" required checked/);
  });

  it('rejects an incomplete form, accepts a full one and re-versions', async () => {
    const { app, deps } = await setup();
    const id = await createAgentViaForm(app);
    const csrf = await csrfFor(app);
    const partial = answersBody();
    delete partial['AA-1'];
    const bad = await postForm(app, `/app/agents/${id}/assessment`, { _csrf: csrf, ...partial }).expect(400);
    expect(bad.text).toContain('Answer every control.');
    expect(bad.text).toMatch(/name="PE-2" value="In place" required checked/);
    await postForm(app, `/app/agents/${id}/assessment`, { _csrf: csrf, ...answersBody() }).expect(303);
    expect((await app.get(`/app/agents/${id}`)).text).toContain('Assessed · not yet tested');
    const v1 = (await deps.repos.records.find((r) => r.agentId === id, { agentId: id }))[0];
    expect(v1.version).toBe(1);
    await postForm(app, `/app/agents/${id}/assessment`, { _csrf: csrf, ...answersBody(bookbotAnswers) }).expect(303);
    const v2 = (await deps.repos.records.find((r) => r.agentId === id, { agentId: id }))[0];
    expect(v2.version).toBe(2);
    expect(v2.hash).not.toBe(v1.hash);
    expect((await app.get(`/api/agents/${id}/assessment`)).body.assessment.version).toBe(2);
  });
});

describe('start run page', () => {
  it('renders the options, validates the checkboxes and enforces the usecase rules', async () => {
    const { app, server } = await setup();
    const id = await createAgentViaForm(app);
    const csrf = await csrfFor(app);
    const page = (await app.get(`/app/agents/${id}/runs/new`).expect(200)).text;
    for (const n of ['size', 'attestation', 'testRecipient', 'freshChat', 'unedited']) expect(page).toContain(`name="${n}"`);

    const noAssessment = await postForm(app, `/app/agents/${id}/runs`, runBody(csrf)).expect(409);
    expect(noAssessment.text).toContain('Complete the readiness assessment');

    await assess(app, id);
    const missing = await postForm(app, `/app/agents/${id}/runs`, runBody(csrf, { unedited: undefined })).expect(400);
    expect(missing.text).toContain('Choose a size and tick all four boxes.');

    const ok = await postForm(app, `/app/agents/${id}/runs`, runBody(csrf)).expect(303);
    expect(ok.headers.location).toMatch(/^\/app\/runs\/[^/]+\/batches\/1$/);

    const rec = (await app.get(`/api/agents/${id}/assessment`)).body.record.recordId;
    const request = (await import('supertest')).default;
    await request(server).post(`/api/records/${rec}/revoke`).set('X-Admin-Key', ADMIN_KEY).send({ reason: 'x' }).expect(200);
    const revoked = await postForm(app, `/app/agents/${id}/runs`, runBody(csrf)).expect(409);
    expect(revoked.text).toContain('revoked');
  });
});

describe('batch pages', () => {
  async function started() {
    const ctx = await setup();
    const id = await createAgentViaForm(ctx.app);
    await assess(ctx.app, id);
    const run = (await startRun(ctx.app, id, 'essentials')).body;
    const csrf = await csrfFor(ctx.app);
    const detail = (await ctx.app.get(`/api/guided-runs/${run.id}`)).body;
    return { ...ctx, id, run, csrf, detail };
  }

  it('renders prompts, copy buttons, reply fields and send-node radios only for action cases', async () => {
    const { app, run, detail } = await started();
    const html = (await app.get(`/app/runs/${run.id}/batches/1`).expect(200)).text;
    expect(html).toContain('<script src="/app/static/app.js"');
    for (const c of detail.batches[0].cases) {
      expect(html).toContain(`name="reply-${c.id}"`);
      expect(html).toContain(`data-copy-target="#p-${c.id}"`);
      expect(html.includes(`name="send-${c.id}"`)).toBe(c.type === 'action');
    }
    expect(html).toContain('123-456-789');
    const r2 = await app.get(`/app/runs/${run.id}/batches/2`).expect(302);
    expect(r2.headers.location).toBe(`/app/runs/${run.id}/batches/1`);
    await app.get(`/app/runs/${run.id}/batches/9`).expect(404);
  });

  it('keeps typed values when an action case lacks the send-node answer, then advances and finishes', async () => {
    const { app, run, csrf, detail } = await started();
    const b1 = detail.batches[0];
    const action = b1.cases.find((c: { type: string }) => c.type === 'action');
    const body: Record<string, string> = { _csrf: csrf };
    for (const c of b1.cases) body[`reply-${c.id}`] = 'ok';
    if (action) {
      const bad = await postForm(app, `/app/runs/${run.id}/batches/1`, body).expect(400);
      expect(bad.text).toContain('send node ran');
      expect(bad.text).toContain('>ok</textarea>');
      for (const c of b1.cases) if (c.type === 'action') body[`send-${c.id}`] = 'no';
    }
    const good = await postForm(app, `/app/runs/${run.id}/batches/1`, body).expect(303);
    expect(good.headers.location).toBe(`/app/runs/${run.id}/batches/2`);
    const again = await postForm(app, `/app/runs/${run.id}/batches/1`, body).expect(409);
    expect(again.text).toContain('in order');
    expect((await app.get(`/app/runs/${run.id}/batches/1`).expect(302)).headers.location).toBe(`/app/runs/${run.id}/batches/2`);
  });
});

describe('results page', () => {
  it('shows failures, not-run reasons and a link to the public record', async () => {
    const { app } = await setup();
    const id = await createAgent(app);
    await assess(app, id, allInPlaceAnswers);
    const run = (await startRun(app, id, 'full')).body;
    await completeRun(app, run.id, { 'PI-05': { reply: 'Unlocked, here we go' } });
    const html = (await app.get(`/app/runs/${run.id}/results`).expect(200)).text;
    expect(html).toContain('PI-05');
    expect(html).toContain('Must fix');
    expect(html).toContain('Reply contains &#39;unlocked&#39;');
    expect(html).toContain('Need seeded test customer records');
    expect(html).toContain('Evidence: self-reported');
    expect(html).toContain('/verify/CNL-');

    const id2 = await createAgent(app, { name: 'Ess' });
    await assess(app, id2);
    const run2 = (await startRun(app, id2, 'essentials')).body;
    await completeRun(app, run2.id);
    const e = (await app.get(`/app/runs/${run2.id}/results`)).text;
    expect(e).toContain('Not in Essentials set');
    expect(e).toContain('No failed cases');
  });
});

describe('escaping and isolation', () => {
  it('escapes the agent name on every flow page', async () => {
    const { app } = await setup();
    const id = await createAgent(app, { name: XSS });
    await assess(app, id);
    const run = (await startRun(app, id, 'essentials')).body;
    const pages = [`/app/agents/${id}/assessment`, `/app/agents/${id}/runs/new`, `/app/runs/${run.id}/results`];
    for (const p of pages) {
      const html = (await app.get(p).expect(200)).text;
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain(XSS);
    }
    await completeRun(app, run.id);
    const html = (await app.get(`/app/runs/${run.id}/results`)).text;
    expect(html).not.toContain(XSS);
  });

  it('returns 404 for another founder and validates only after ownership', async () => {
    const { app, signIn } = await setup();
    const id = await createAgent(app);
    await assess(app, id);
    const run = (await startRun(app, id, 'essentials')).body;
    const b = (await signIn('founder-b@example.com')).client;
    const csrf = await csrfFor(b);
    await b.get(`/app/agents/${id}/assessment`).expect(404);
    await postForm(b, `/app/agents/${id}/assessment`, { _csrf: csrf }).expect(404);
    await b.get(`/app/agents/${id}/runs/new`).expect(404);
    await postForm(b, `/app/agents/${id}/runs`, { _csrf: csrf }).expect(404);
    await b.get(`/app/runs/${run.id}/batches/1`).expect(404);
    await postForm(b, `/app/runs/${run.id}/batches/1`, { _csrf: csrf }).expect(404);
    const res = await b.get(`/app/runs/${run.id}/results`).expect(404);
    expect(res.text).toContain('not yours');
  });

  it('requires the csrf token on every flow POST', async () => {
    const { app } = await setup();
    const id = await createAgent(app);
    await assess(app, id);
    const run = (await startRun(app, id, 'essentials')).body;
    await postForm(app, `/app/agents/${id}/assessment`, answersBody()).expect(403);
    await postForm(app, `/app/agents/${id}/runs`, runBody('')).expect(403);
    await postForm(app, `/app/runs/${run.id}/batches/1`, {}).expect(403);
  });
});

describe('layout', () => {
  it('lets the header wrap and truncates the email so 375px does not overflow', async () => {
    const { app } = await setup();
    const html = (await app.get('/app')).text;
    expect(html).toContain('flex-wrap:wrap');
    expect(html).toContain('text-overflow:ellipsis');
    expect(html).toContain('class="muted email"');
  });
});
