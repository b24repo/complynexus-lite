import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getCase } from '../../src/library/library';
import { setup } from '../api/helpers';
import { allInPlaceAnswers } from '../fixtures/bookbot';
import { entriesFor } from '../fixtures/replies';
import { agentFormBody, csrfOf } from './helpers';

describe('Essentials journey through the HTML routes', () => {
  it('signs in, creates, assesses, tests in 4 batches and ends Current', async () => {
    const { server, notifier } = await setup();
    const anon = request.agent(server);
    await anon.post('/auth/magic-link').type('form').send({ email: 'journey@example.com' }).expect(303).expect('Location', '/app/sign-in/sent');
    const u = new URL(/https?:\/\/\S+/.exec(notifier.sent.at(-1)!.text)![0]);
    await anon.get(u.pathname + u.search).expect(303).expect('Location', '/app');
    let html = (await anon.get('/app').expect(200)).text;
    expect(html).toContain('New agent');

    const csrf = csrfOf((await anon.get('/app/agents/new').expect(200)).text);
    const created = await anon.post('/app/agents').type('form').send(agentFormBody(csrf)).expect(303);
    const agentId = created.headers.location.split('/').pop()!;

    await anon
      .post(`/app/agents/${agentId}/assessment`)
      .type('form')
      .send({ _csrf: csrf, ...Object.fromEntries(allInPlaceAnswers.map((a) => [a.controlId, a.status])) })
      .expect(303);

    const started = await anon
      .post(`/app/agents/${agentId}/runs`)
      .type('form')
      .send({ _csrf: csrf, size: 'essentials', attestation: 'on', testRecipient: 'on', freshChat: 'on', unedited: 'on' })
      .expect(303);
    const runId = started.headers.location.split('/')[3];
    const run = (await anon.get(`/api/guided-runs/${runId}`)).body;
    expect(run.batches).toHaveLength(4);

    for (const b of run.batches) {
      html = (await anon.get(`/app/runs/${runId}/batches/${b.index}`).expect(200)).text;
      for (const c of b.cases) expect(html).toContain(`name="reply-${c.id}"`);
      const body: Record<string, string> = { _csrf: csrf };
      for (const e of entriesFor(b.cases.map((c: { id: string }) => getCase(c.id)))) {
        body[`reply-${e.caseId}`] = e.reply;
        if (e.sendNodeRan) body[`send-${e.caseId}`] = e.sendNodeRan;
      }
      const res = await anon.post(`/app/runs/${runId}/batches/${b.index}`).type('form').send(body).expect(303);
      expect(res.headers.location).toBe(b.index < 4 ? `/app/runs/${runId}/batches/${b.index + 1}` : `/app/runs/${runId}/results`);
    }

    html = (await anon.get(`/app/runs/${runId}/results`).expect(200)).text;
    expect(html).toContain('10 of 10 run cases passed');
    html = (await anon.get(`/app/agents/${agentId}`).expect(200)).text;
    expect(html).toContain('Current');
    expect(html).toContain('/verify/CNL-');
    const recordId = /\/verify\/(CNL-\d{4}-\d{4})/.exec(html)![1];
    expect((await anon.get(`/verify/${recordId}`)).text).toContain('Evidence: self-reported');

    await anon.post('/auth/logout').type('form').send({}).expect(303);
    await anon.get('/app').expect(302);
  });
});
