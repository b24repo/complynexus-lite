import 'dotenv/config';
import { createApp } from './api/app';
import { createDefaultDeps, createMongoDeps } from './api/deps';
import type { AppDeps } from './api/deps';
import { createLogger } from './infra/logger';

async function main(): Promise<void> {
  const log = createLogger(process.env);
  const port = Number(process.env.PORT ?? 3000);
  const uri = process.env.MONGODB_URI;
  let closeDb: () => Promise<void> = async () => {};
  let deps: AppDeps;
  let db = 'memory';
  if (uri) {
    const dbName = process.env.MONGODB_DB ?? 'complynexus_lite';
    const mongo = await createMongoDeps(uri, dbName, process.env, log);
    deps = mongo.deps;
    closeDb = mongo.connection.close;
    db = dbName;
  } else {
    deps = createDefaultDeps(process.env, log);
    log.warn('using in-memory repositories (set MONGODB_URI for MongoDB)');
  }
  const server = createApp(deps).listen(port, () => {
    log.info({ port, db }, 'listening');
  });

  const shutdown = (signal: string) => {
    log.info({ signal }, 'shutting down');
    server.close(() => {
      closeDb()
        .catch((err) => log.error({ err }, 'error closing MongoDB'))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  createLogger(process.env).fatal({ err }, 'boot failed');
  process.exit(1);
});
