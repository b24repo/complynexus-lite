import { createLogger } from '../infra/logger';
import type { Logger } from '../infra/logger';
import { createGrader } from '../grading/grader';
import type { Grader } from '../grading/grader';
import { SystemClock } from '../infra/clock';
import type { Clock } from '../infra/clock';
import { InMemoryRecordIdSource } from '../infra/ids';
import type { RecordIdSource } from '../infra/ids';
import { InMemoryLoginTokenStore, InMemoryRepository } from '../infra/repo/inMemory';
import { connectMongo } from '../infra/repo/mongoClient';
import type { MongoConnection } from '../infra/repo/mongoClient';
import { createNotifier } from '../infra/notify/notifier';
import type { Notifier } from '../infra/notify/notifier';
import { MongoRecordIdSource } from '../infra/repo/mongoIds';
import { createMongoRepos, ensureMongoIndexes } from '../infra/repo/mongo';
import type { Repos } from '../infra/repo/repository';
import { csrfSecretFrom } from '../web/csrf';

export interface AuthConfig {
  sessionTtlMs: number;
  loginTokenTtlMs: number;
  /** Where the magic-link callback sends the browser after sign-in. */
  redirectPath: string;
  allowDevLogin: boolean;
  magicLinkRateLimit: { limit: number; windowMs: number };
}

export const DEFAULT_AUTH: AuthConfig = {
  sessionTtlMs: 30 * 24 * 3600_000,
  loginTokenTtlMs: 15 * 60_000,
  redirectPath: '/app',
  allowDevLogin: false,
  magicLinkRateLimit: { limit: 5, windowMs: 60_000 },
};

/** Dev login needs ALLOW_DEV_LOGIN exactly '1' and an admin key. It is deliberately not tied to NODE_ENV. */
export function authConfig(env: NodeJS.ProcessEnv): AuthConfig {
  return { ...DEFAULT_AUTH, allowDevLogin: env.ALLOW_DEV_LOGIN === '1' && !!env.ADMIN_KEY };
}

export interface AppDeps {
  repos: Repos;
  recordIds: RecordIdSource;
  clock: Clock;
  grader: Grader;
  notifier: Notifier;
  adminKey?: string;
  logger: Logger;
  /** Health hook: undefined means in-memory. */
  ping?: () => Promise<'ok' | 'down'>;
  /** e.g. https://staging.complynexus.com; when unset, host comes from the request. */
  publicBaseUrl?: string;
  verifyRateLimit?: { limit: number; windowMs: number };
  trustProxy?: boolean;
  auth: AuthConfig;
  /** HMAC secret for /app form tokens. */
  csrfSecret: string;
  /** NODE_ENV === 'production': magic links never use the request Host header. */
  production?: boolean;
}

/** Throws when production would have to trust the Host header for emailed links. */
export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production' && !publicBaseUrlFrom(env)) {
    throw new Error('PUBLIC_BASE_URL is required when NODE_ENV=production (magic links must not use the request Host header)');
  }
}

function publicBaseUrlFrom(env: NodeJS.ProcessEnv): string | undefined {
  const v = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  return v ? v : undefined;
}

export function createDefaultDeps(env: NodeJS.ProcessEnv = process.env, logger: Logger = createLogger(env)): AppDeps {
  assertProductionConfig(env);
  return {
    repos: {
      agents: new InMemoryRepository(),
      assessments: new InMemoryRepository(),
      runs: new InMemoryRepository(),
      records: new InMemoryRepository(),
      recordVersions: new InMemoryRepository(),
      founders: new InMemoryRepository(),
      loginTokens: new InMemoryLoginTokenStore(),
      sessions: new InMemoryRepository(),
    },
    recordIds: new InMemoryRecordIdSource(),
    clock: new SystemClock(),
    grader: createGrader(env, { warn: (msg, meta) => logger.warn(meta ?? {}, String(msg)) }),
    notifier: createNotifier(env),
    adminKey: process.env.ADMIN_KEY,
    logger,
    publicBaseUrl: publicBaseUrlFrom(env),
    trustProxy: env.TRUST_PROXY === '1',
    auth: authConfig(env),
    csrfSecret: csrfSecretFrom(env),
    production: env.NODE_ENV === 'production',
  };
}

/** Mongo-backed deps. Caller owns `connection` and must close it on shutdown. */
export async function createMongoDeps(
  uri: string,
  dbName: string,
  env: NodeJS.ProcessEnv = process.env,
  logger: Logger = createLogger(env),
): Promise<{ deps: AppDeps; connection: MongoConnection }> {
  assertProductionConfig(env);
  const connection = await connectMongo(uri, dbName);
  await ensureMongoIndexes(connection.db);
  const deps: AppDeps = {
    repos: createMongoRepos(connection.db),
    recordIds: new MongoRecordIdSource(connection.db),
    clock: new SystemClock(),
    grader: createGrader(env, { warn: (msg, meta) => logger.warn(meta ?? {}, String(msg)) }),
    notifier: createNotifier(env),
    adminKey: process.env.ADMIN_KEY,
    logger,
    publicBaseUrl: publicBaseUrlFrom(env),
    trustProxy: env.TRUST_PROXY === '1',
    auth: authConfig(env),
    csrfSecret: csrfSecretFrom(env),
    production: env.NODE_ENV === 'production',
    ping: async () => {
      try {
        await connection.db.command({ ping: 1 });
        return 'ok';
      } catch (err) {
        logger.warn({ err }, 'mongo ping failed');
        return 'down';
      }
    },
  };
  return { deps, connection };
}
