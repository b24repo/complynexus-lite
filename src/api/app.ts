import express from 'express';
import type { Application } from 'express';
import type { AppDeps } from './deps';
import { errorHandler, notFoundHandler } from './errors';
import { requestId } from './middleware/requestId';
import { requestLog } from './middleware/requestLog';
import { requireFounder } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { security } from './middleware/security';
import { agentRoutes } from './routes/agents';
import { authRoutes } from './routes/auth';
import { guidedRoutes } from './routes/guided';
import { healthRoutes } from './routes/health';
import { recordRoutes } from './routes/records';
import { verifyRoutes } from './routes/verify';
import { appRoutes } from '../web/routes';
import { LIBRARY_VERSION, loadLibrary } from '../library/library';

export function createApp(deps: AppDeps): Application {
  const app = express();
  if (deps.trustProxy) app.set('trust proxy', 1);
  app.use(requestId);
  app.use(requestLog(deps.logger));
  app.use(security);
  app.use(express.json({ limit: '100kb' }));
  app.use(healthRoutes(deps));
  app.get('/api/library', (_req, res) => {
    res.json({ version: LIBRARY_VERSION, cases: loadLibrary() });
  });
  app.use(['/app', '/auth'], express.urlencoded({ extended: false, limit: '100kb' }));
  app.use('/auth', authRoutes(deps));
  app.use('/app', appRoutes(deps));
  const auth = requireFounder(deps);
  app.use('/api/agents', auth, agentRoutes(deps));
  app.use('/api/guided-runs', auth);
  app.use('/api', guidedRoutes(deps));
  app.use('/api/records', recordRoutes(deps));
  app.use('/verify', rateLimit(deps.verifyRateLimit ?? { limit: 120, windowMs: 60_000 }), verifyRoutes(deps));
  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return app;
}
