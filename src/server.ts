import 'dotenv/config';
import { createApp } from './api/app';
import { createDefaultDeps, createMongoDeps } from './api/deps';
import type { AppDeps } from './api/deps';

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const uri = process.env.MONGODB_URI;
  let closeDb: () => Promise<void> = async () => {};
  let deps: AppDeps;
  if (uri) {
    const dbName = process.env.MONGODB_DB ?? 'complynexus_lite';
    const mongo = await createMongoDeps(uri, dbName);
    deps = mongo.deps;
    closeDb = mongo.connection.close;
    console.log(`ComplyNexus Lite POC using MongoDB database ${dbName}`);
  } else {
    deps = createDefaultDeps();
    console.log('ComplyNexus Lite POC using in-memory repositories (set MONGODB_URI for MongoDB)');
  }
  const server = createApp(deps).listen(port, () => {
    console.log(`ComplyNexus Lite POC listening on ${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      closeDb()
        .catch((err) => console.error('error closing MongoDB', err))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
