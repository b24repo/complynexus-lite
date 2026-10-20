import type { Response, Router } from 'express';
import type { AppDeps } from '../api/deps';
import { HttpError } from '../api/errors';
import { asyncRouter, baseUrl } from '../api/helpers';
import { founderOf } from '../api/middleware/auth';
import { latestAssessment, recordForAgent } from '../api/helpers';
import { AgentBody, AssessmentBody, BatchBody, ChangeBody, GuidedRunBody, PublicBody } from '../api/schemas';
import { DomainError } from '../domain/types';
import { agentOverview, createAgent, declareChange, getAgent, listAgentsForFounder, submitAssessment } from '../usecases/agents';
import { resultsView, runView, startRun, submitRunBatch } from '../usecases/guided';
import { setPublic } from '../usecases/records';
import { agentFromForm, answersFromForm, entriesFromForm, runFromForm } from './forms';
import { csrfGuard, htmlErrorHandler, publicHost, requireFounderPage, zodMessages } from './middleware';
import { APP_JS } from './static';
import { renderAgentForm } from './views/agentForm';
import { renderAgentOverview } from './views/agentOverview';
import { renderAssessment } from './views/assessment';
import { renderBatch } from './views/batch';
import { renderDashboard } from './views/dashboard';
import { renderResults } from './views/results';
import { renderRunNew } from './views/runNew';
import { renderSignIn, renderSignInSent } from './views/signIn';

export function appRoutes(deps: AppDeps): Router {
  const router = asyncRouter();
  const host = publicHost(deps);
  const ctx = (res: Response) => ({
    founderEmail: founderOf(res).email,
    csrf: res.locals.csrf as string,
    publicHost: host,
  });
  const send = (res: Response, status: number, html: string): void => {
    res.status(status).type('html').send(html);
  };

  router.get('/static/app.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(APP_JS);
  });
  router.get('/sign-in', (req, res) =>
    send(
      res,
      200,
      renderSignIn({
        publicHost: host,
        error: req.query.error === 'email' ? 'Enter a valid email address.' : undefined,
      }),
    ),
  );
  router.get('/sign-in/sent', (_req, res) => send(res, 200, renderSignInSent({ publicHost: host })));

  router.use(requireFounderPage(deps));
  router.use(csrfGuard(deps));

  router.get('/', async (_req, res) => {
    send(res, 200, renderDashboard(ctx(res), await listAgentsForFounder(deps, founderOf(res).id)));
  });

  router.get('/agents/new', (_req, res) => send(res, 200, renderAgentForm(ctx(res), {}, [])));

  router.post('/agents', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const parsed = AgentBody.safeParse(agentFromForm(body));
    if (!parsed.success) {
      send(res, 400, renderAgentForm(ctx(res), body, zodMessages(parsed.error)));
      return;
    }
    const agent = await createAgent(deps, founderOf(res).id, parsed.data);
    res.redirect(303, `/app/agents/${agent.id}`);
  });

  router.get('/agents/:id', async (req, res) => {
    const view = await agentOverview(deps, req.params.id, founderOf(res).id);
    send(res, 200, renderAgentOverview(ctx(res), view, baseUrl(deps, req)));
  });

  router.post('/agents/:id/changes', async (req, res) => {
    const owner = founderOf(res).id;
    const parsed = ChangeBody.safeParse(req.body);
    try {
      // Ownership is checked first inside the usecase; validation only runs for the owner.
      await declareChange(deps, req.params.id, owner, () => {
        if (!parsed.success) throw parsed.error;
      });
    } catch (err) {
      if (parsed.success || err !== parsed.error) throw err;
      const view = await agentOverview(deps, req.params.id, owner);
      send(
        res,
        400,
        renderAgentOverview(ctx(res), view, baseUrl(deps, req), {
          changeError: 'Describe the change.',
        }),
      );
      return;
    }
    res.redirect(303, `/app/agents/${req.params.id}`);
  });

  router.post('/agents/:id/public', async (req, res) => {
    const owner = founderOf(res).id;
    const view = await agentOverview(deps, req.params.id, owner);
    if (view.record) {
      await setPublic(
        deps,
        view.record.recordId,
        owner,
        () =>
          PublicBody.parse({
            showTestSummary: (req.body as Record<string, unknown>).showTestSummary === 'true',
          }).showTestSummary,
      );
    }
    res.redirect(303, `/app/agents/${req.params.id}`);
  });

  router.get('/agents/:id/assessment', async (req, res) => {
    const agent = await getAgent(deps, req.params.id, founderOf(res).id);
    const current = await latestAssessment(deps, agent.id);
    const values = Object.fromEntries((current?.answers ?? []).map((a) => [a.controlId, a.status]));
    send(res, 200, renderAssessment(ctx(res), agent, values, []));
  });

  router.post('/agents/:id/assessment', async (req, res) => {
    const owner = founderOf(res).id;
    const body = req.body as Record<string, unknown>;
    const parsed = AssessmentBody.safeParse(answersFromForm(body));
    try {
      // Ownership is checked first inside the usecase; validation only runs for the owner.
      await submitAssessment(deps, req.params.id, owner, () => {
        if (!parsed.success) throw parsed.error;
        return parsed.data;
      });
    } catch (err) {
      const invalid = (!parsed.success && err === parsed.error) || (err instanceof DomainError && err.code === 'INCOMPLETE_ASSESSMENT');
      if (!invalid) throw err;
      const agent = await getAgent(deps, req.params.id, owner);
      send(res, 400, renderAssessment(ctx(res), agent, body, ['Answer every control.']));
      return;
    }
    res.redirect(303, `/app/agents/${req.params.id}`);
  });

  router.get('/agents/:id/runs/new', async (req, res) => {
    const agent = await getAgent(deps, req.params.id, founderOf(res).id);
    send(res, 200, renderRunNew(ctx(res), agent, {}, []));
  });

  router.post('/agents/:id/runs', async (req, res) => {
    const owner = founderOf(res).id;
    const body = req.body as Record<string, unknown>;
    const parsed = GuidedRunBody.safeParse(runFromForm(body));
    let run;
    try {
      run = await startRun(deps, req.params.id, owner, () => {
        if (!parsed.success) throw parsed.error;
        return parsed.data;
      });
    } catch (err) {
      if (parsed.success || err !== parsed.error) throw err;
      const agent = await getAgent(deps, req.params.id, owner);
      send(res, 400, renderRunNew(ctx(res), agent, body, ['Choose a size and tick all four boxes.']));
      return;
    }
    res.redirect(303, `/app/runs/${run.id}/batches/1`);
  });

  router.get('/runs/:runId/batches/:index', async (req, res) => {
    const run = await runView(deps, req.params.runId, founderOf(res).id);
    const index = Number(req.params.index);
    const batch = run.batches.find((b) => b.index === index);
    if (!batch) throw new HttpError(404, 'NOT_FOUND');
    const next = run.batches.find((b) => !b.savedAt);
    if (batch.savedAt || !next || next.index !== index) {
      res.redirect(302, next ? `/app/runs/${run.id}/batches/${next.index}` : `/app/runs/${run.id}/results`);
      return;
    }
    send(res, 200, renderBatch(ctx(res), run, batch, {}, []));
  });

  router.post('/runs/:runId/batches/:index', async (req, res) => {
    const owner = founderOf(res).id;
    const body = req.body as Record<string, unknown>;
    const run = await runView(deps, req.params.runId, owner);
    const index = Number(req.params.index);
    const batch = run.batches.find((b) => b.index === index);
    if (!batch) throw new HttpError(404, 'NOT_FOUND');
    const parsed = BatchBody.safeParse(entriesFromForm(body, batch.caseIds));
    const bad = (msg: string): void => send(res, 400, renderBatch(ctx(res), run, batch, body, [msg]));
    try {
      const out = await submitRunBatch(deps, run.id, owner, index, () => {
        if (!parsed.success) throw parsed.error;
        return parsed.data.entries;
      });
      res.redirect(303, out.nextBatch ? `/app/runs/${run.id}/batches/${out.nextBatch.index}` : `/app/runs/${run.id}/results`);
    } catch (err) {
      if (!parsed.success && err === parsed.error) return bad('Check the replies and answers.');
      if (err instanceof DomainError && err.code === 'SEND_NODE_ANSWER_REQUIRED') {
        return bad('For each action case, say whether the send node ran.');
      }
      throw err;
    }
  });

  router.get('/runs/:runId/results', async (req, res) => {
    const owner = founderOf(res).id;
    const r = await resultsView(deps, req.params.runId, owner);
    const agent = await getAgent(deps, r.run.agentId, owner);
    const record = await recordForAgent(deps, agent.id);
    send(res, 200, renderResults(ctx(res), agent, r, record ? `/verify/${record.recordId}` : undefined));
  });

  router.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND')));
  router.use(htmlErrorHandler(deps));
  return router;
}
