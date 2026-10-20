import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createDefaultDeps, createMongoDeps } from '../api/deps';
import type { AppDeps } from '../api/deps';
import { createLogger } from '../infra/logger';
import { runTransitions } from './transitions';

async function main(): Promise<number> {
  const log = createLogger(process.env, { stderr: true });
  let args;
  try {
    args = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, now: { type: 'string' } } }).values;
  } catch (err) {
    log.error({ err }, 'bad arguments; usage: --dry-run [--now=<ISO date>]');
    return 2;
  }
  const dryRun = args['dry-run'] === true;
  if (args.now !== undefined && !dryRun) {
    log.error('--now is only allowed with --dry-run');
    return 2;
  }
  const now = args.now !== undefined ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    log.error({ now: args.now }, 'invalid --now date');
    return 2;
  }
  let deps: AppDeps;
  let closeDb: () => Promise<void> = async () => {};
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const mongo = await createMongoDeps(uri, process.env.MONGODB_DB ?? 'complynexus_lite', process.env, log);
    deps = mongo.deps;
    closeDb = mongo.connection.close;
  } else {
    deps = createDefaultDeps(process.env, log);
    log.warn('using in-memory repositories (set MONGODB_URI for MongoDB); nothing to process');
  }
  try {
    let baseUrl = deps.publicBaseUrl;
    if (!baseUrl) {
      log.warn('PUBLIC_BASE_URL not set; using http://localhost:3000 for verify links');
      baseUrl = 'http://localhost:3000';
    }
    const summary = await runTransitions(deps, { now, dryRun, baseUrl });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary.failed > 0 ? 1 : 0;
  } finally {
    await closeDb();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    createLogger(process.env, { stderr: true }).fatal({ err }, 'transitions job crashed');
    process.exit(1);
  });
