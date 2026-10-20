import type { Response, Router } from 'express';
import type { AppDeps } from '../api/deps';
import { HttpError } from '../api/errors';
import { asyncRouter, baseUrl } from '../api/helpers';
import { founderOf } from '../api/middleware/auth';
import { AgentBody, ChangeBody, PublicBody } from '../api/schemas';
import { agentOverview, createAgent, declareChange, listAgentsForFounder } from '../usecases/agents';
import { setPublic } from '../usecases/records';
import { agentFromForm } from './forms';
import { csrfGuard, htmlErrorHandler, publicHost, requireFounderPage, zodMessages } from './middleware';
import { APP_JS } from './static';
import { renderAgentForm } from './views/agentForm';
import { renderAgentOverview } from './views/agentOverview';
import { renderDashboard } from './views/dashboard';
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

  // 04c adds assessment, runs, batches and results here.
  router.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND')));
  router.use(htmlErrorHandler(deps));
  return router;
}
