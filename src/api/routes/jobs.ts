import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { HttpError } from '../errors';
import { asyncRouter, baseUrl } from '../helpers';
import { requireAdminKey } from '../middleware/admin';
import { TransitionsJobBody } from '../schemas';
import { runTransitions } from '../../jobs/transitions';

export function jobRoutes(deps: AppDeps): Router {
  const router = asyncRouter();
  let running = false;
  router.post('/transitions', async (req, res) => {
    requireAdminKey(deps, req); // before body parsing, so anonymous callers get 403 rather than 400
    const body = TransitionsJobBody.parse(req.body ?? {});
    const base = baseUrl(deps, req);
    if (running) throw new HttpError(409, 'JOB_RUNNING');
    running = true;
    try {
      res.json(await runTransitions(deps, { now: body.now ? new Date(body.now) : deps.clock.now(), dryRun: body.dryRun, baseUrl: base }));
    } finally {
      running = false;
    }
  });
  return router;
}
