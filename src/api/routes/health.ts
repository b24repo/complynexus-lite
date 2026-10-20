import type { Router } from 'express';
import type { AppDeps } from '../deps';
import { asyncRouter } from '../helpers';
import { VERSION } from '../../infra/version';
import { LIBRARY_VERSION, loadLibrary } from '../../library/library';

export function healthRoutes(deps: AppDeps): Router {
  const router = asyncRouter();
  router.get('/healthz', async (_req, res) => {
    const db = deps.ping ? await deps.ping() : 'memory';
    let library: { version: string; cases: number } | { error: string };
    try {
      library = { version: LIBRARY_VERSION, cases: loadLibrary().length };
    } catch (e) {
      library = { error: (e as Error).message };
    }
    const ok = db !== 'down' && !('error' in library);
    res
      .status(ok ? 200 : 503)
      .json({ status: ok ? 'ok' : 'degraded', version: VERSION, commit: process.env.GIT_COMMIT ?? 'dev', db, library });
  });
  return router;
}
