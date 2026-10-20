import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assess, createAgent, setup, testedAgent } from '../api/helpers';
import { agentFormBody, createAgentViaForm, csrfOf, postForm } from './helpers';

describe('anonymous access', () => {
  it('redirects /app and POSTs to sign-in', async () => {
    const { anon } = await setup();
    const g = await anon.get('/app').expect(302);
    expect(g.headers.location).toBe('/app/sign-in');
    const p = await anon.post('/app/agents').type('form').send({ name: 'x' }).expect(303);
    expect(p.headers.location).toBe('/app/sign-in');
  });

  it('renders the sign-in page and its error', async () => {
    const { anon } = await setup();
    const res = await anon.get('/app/sign-in').expect(200);
    expect(res.text).toContain('Sign in');
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('action="/auth/magic-link"');
    expect(res.text).toContain('family=Lexend');
    expect((await anon.get('/app/sign-in?error=email')).text).toContain('Enter a valid email address.');
  });

  it('serves the static script and a CSP without inline script', async () => {
    const { anon } = await setup();
    const js = await anon.get('/app/static/app.js').expect(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    expect(js.text).toContain('data-copy');
    const page = await anon.get('/app/sign-in');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.text).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(page.text).not.toMatch(/\son[a-z]+=/);
  });

  it('serves a not-found page inside the app for signed-in founders', async () => {
    const { app } = await setup();
    const res = await app.get('/app/nope').expect(404);
    expect(res.text).toContain('Page not found.');
  });
});

describe('form sign-in', () => {
  it('works end to end and keeps the JSON path', async () => {
    const { server, notifier, deps } = await setup();
    const client = request.agent(server);
    const sent = await client.post('/auth/magic-link').type('form').send({ email: 'form@example.com' }).expect(303);
    expect(sent.headers.location).toBe('/app/sign-in/sent');
    expect((await client.get('/app/sign-in/sent')).text).toContain('Check your email');
    const link = notifier.sent.at(-1)!.text.match(/https?:\/\/\S+/)![0];
    const u = new URL(link);
    const cb = await client.get(u.pathname + u.search).expect(303);
    expect(cb.headers.location).toBe(deps.auth.redirectPath);
    const dash = await client.get('/app').expect(200);
    expect(dash.text).toContain('Your agents');
    expect(dash.text).toContain('form@example.com');

    const bad = await request(server).post('/auth/magic-link').type('form').send({ email: 'nope' }).expect(303);
    expect(bad.headers.location).toBe('/app/sign-in?error=email');
    await request(server).post('/auth/magic-link').send({ email: 'json@example.com' }).expect(202);
    await request(server).post('/auth/magic-link').send({ email: 'nope' }).expect(400);
  });

  it('signs out through the form', async () => {
    const { app } = await setup();
    const out = await app.post('/auth/logout').type('form').send({}).expect(303);
    expect(out.headers.location).toBe('/app/sign-in');
    await app.get('/app').expect(302);
  });
});

describe('dashboard', () => {
  it('shows the empty state, then agents with pills, scoped to the founder', async () => {
    const { app, signIn } = await setup();
    expect((await app.get('/app')).text).toContain('No agents yet.');
    await createAgentViaForm(app);
    const jsonId = await createAgent(app, { name: 'JsonBot' });
    let html = (await app.get('/app')).text;
    expect(html).toContain('BookBot');
    expect(html).toContain('JsonBot');
    expect(html).toContain('Not assessed');
    await assess(app, jsonId);
    html = (await app.get('/app')).text;
    expect(html).toContain('Assessed · not yet tested');
    expect(html).toContain('CNL-');
    const other = await signIn('b@example.com');
    expect((await other.client.get('/app')).text).not.toContain('BookBot');
  });
});

describe('agent form', () => {
  it('renders every field and the csrf token', async () => {
    const { app } = await setup();
    const html = (await app.get('/app/agents/new').expect(200)).text;
    for (const n of [
      'orgName',
      'name',
      'purpose',
      'ownerName',
      'buildType',
      'canActIrreversibly',
      'approvalMode',
      'approvalLimitHkd',
      'tools',
      '_csrf',
    ]) {
      expect(html).toContain(`name="${n}"`);
    }
  });

  it('rejects missing and bad csrf tokens', async () => {
    const { app } = await setup();
    const none = await postForm(app, '/app/agents', agentFormBody('')).expect(403);
    expect(none.text).toContain('expired');
    await postForm(app, '/app/agents', agentFormBody('a'.repeat(64))).expect(403);
  });

  it('re-renders validation errors and preserves values', async () => {
    const { app } = await setup();
    const csrf = csrfOf((await app.get('/app/agents/new')).text);
    const res = await postForm(app, '/app/agents', agentFormBody(csrf, { name: '' })).expect(400);
    expect(res.text).toContain('name:');
    expect(res.text).toContain('value="Acme Studio"');
    expect(res.text).toContain('value="500"');
  });

  it('creates an agent and redirects to its overview', async () => {
    const { app } = await setup();
    const id = await createAgentViaForm(app);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('agent overview', () => {
  it('walks through the statuses', async () => {
    const { app } = await setup();
    const id = await createAgentViaForm(app);
    let html = (await app.get(`/app/agents/${id}`).expect(200)).text;
    expect(html).toContain('Start assessment');
    expect(html).toContain('No open items.');
    expect(html).not.toContain('verify-url');
    expect(html).not.toContain('Download PDF');

    await assess(app, id);
    html = (await app.get(`/app/agents/${id}`)).text;
    expect(html).toContain('Assessed · not yet tested');
    expect(html).toContain('Score 57');
    expect(html).toContain('High risk');
    expect(html).toContain('Human approval for irreversible actions');
    expect(html).toMatch(/http:\/\/127\.0\.0\.1:\d+\/verify\/CNL-/);
    expect(html).toContain('data-copy-target="#verify-url"');
    expect(html).toContain('<script src="/app/static/app.js"');
    expect(html).toContain('Start test');
    expect(html).toMatch(/href="\/api\/records\/CNL-[0-9-]+\/pdf">Download PDF/);

    const recordId = /\/verify\/(CNL-[0-9-]+)"/.exec(html)![1];
    const csrf = csrfOf(html);
    await postForm(app, `/app/agents/${id}/public`, {
      _csrf: csrf,
      showTestSummary: 'true',
    }).expect(303);
    expect((await app.get(`/api/records/${recordId}`)).body.showTestSummary).toBe(true);
    expect((await app.get(`/app/agents/${id}`)).text).toContain('Hide public test summary');

    const empty = await postForm(app, `/app/agents/${id}/changes`, {
      _csrf: csrf,
      description: '',
    }).expect(400);
    expect(empty.text).toContain('Describe the change.');
    await postForm(app, `/app/agents/${id}/changes`, {
      _csrf: csrf,
      description: 'new prompt',
    }).expect(303);
    expect((await app.get(`/api/agents/${id}`)).body.changedAt).toBeTruthy();
  });

  it('shows Re-test due after a change on a tested agent and continues an active run', async () => {
    const { app } = await setup();
    const { agentId } = await testedAgent(app);
    let html = (await app.get(`/app/agents/${agentId}`)).text;
    expect(html).toContain('Current');
    await postForm(app, `/app/agents/${agentId}/changes`, {
      _csrf: csrfOf(html),
      description: 'tweak',
    }).expect(303);
    html = (await app.get(`/app/agents/${agentId}`)).text;
    expect(html).toContain('Re-test due');

    const id2 = await createAgent(app, { name: 'Second' });
    await assess(app, id2);
    const run = (
      await app.post(`/api/agents/${id2}/guided-runs`).send({
        size: 'full',
        attestation: true,
        safety: { testRecipient: true, freshChat: true, unedited: true },
      })
    ).body;
    const html2 = (await app.get(`/app/agents/${id2}`)).text;
    expect(html2).toContain(`/app/runs/${run.id}/batches/1`);
    expect(html2).toContain('Continue test (batch 1 of');
  });

  it('escapes interpolated values', async () => {
    const { app } = await setup();
    const evil = '<script>alert(1)</script>';
    const id = await createAgentViaForm(app, { name: evil });
    const escaped = '&lt;script&gt;alert(1)&lt;/script&gt;';
    const dash = (await app.get('/app')).text;
    expect(dash).toContain(escaped);
    expect(dash).not.toContain(evil);
    const ov = (await app.get(`/app/agents/${id}`)).text;
    expect(ov).toContain(escaped);
    expect(ov).not.toContain(evil);
  });

  it("hides another founder's agent", async () => {
    const { app, signIn } = await setup();
    const id = await createAgentViaForm(app);
    const b = await signIn('b@example.com');
    const html = (await b.client.get('/app')).text;
    const res = await b.client.get(`/app/agents/${id}`).expect(404);
    expect(res.text).toContain('not yours');
    await postForm(b.client, `/app/agents/${id}/changes`, {
      _csrf: csrfOf((await b.client.get('/app/agents/new')).text),
      description: '',
    }).expect(404);
    await postForm(b.client, `/app/agents/${id}/public`, {
      _csrf: csrfOf((await b.client.get('/app/agents/new')).text),
    }).expect(404);
    expect(html).not.toContain(id);
  });
});
