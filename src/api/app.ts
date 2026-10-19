import express from 'express';
import type { Application } from 'express';
import type { AppDeps } from './deps';
import { errorHandler, notFoundHandler } from './errors';
import { agentRoutes } from './routes/agents';
import { guidedRoutes } from './routes/guided';
import { recordRoutes } from './routes/records';
import { verifyRoutes } from './routes/verify';
import { LIBRARY_VERSION, loadLibrary } from '../library/library';

export function createApp(deps: AppDeps): Application {
  const app = express();
  app.use(express.json());
  app.get('/api/library', (_req, res) => {
    res.json({ version: LIBRARY_VERSION, cases: loadLibrary() });
  });
  app.use('/api/agents', agentRoutes(deps));
  app.use('/api', guidedRoutes(deps));
  app.use('/api/records', recordRoutes(deps));
  app.use('/verify', verifyRoutes(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
