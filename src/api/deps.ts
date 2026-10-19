import { createGrader } from '../grading/grader';
import type { Grader } from '../grading/grader';
import { SystemClock } from '../infra/clock';
import type { Clock } from '../infra/clock';
import { InMemoryRecordIdSource } from '../infra/ids';
import type { RecordIdSource } from '../infra/ids';
import { InMemoryRepository } from '../infra/repo/inMemory';
import { connectMongo } from '../infra/repo/mongoClient';
import type { MongoConnection } from '../infra/repo/mongoClient';
import { MongoRecordIdSource } from '../infra/repo/mongoIds';
import { createMongoRepos, ensureMongoIndexes } from '../infra/repo/mongo';
import type { Repos } from '../infra/repo/repository';

export interface AppDeps {
  repos: Repos;
  recordIds: RecordIdSource;
  clock: Clock;
  grader: Grader;
  adminKey?: string;
}

export function createDefaultDeps(): AppDeps {
  return {
    repos: {
      agents: new InMemoryRepository(),
      assessments: new InMemoryRepository(),
      runs: new InMemoryRepository(),
      records: new InMemoryRepository(),
    },
    recordIds: new InMemoryRecordIdSource(),
    clock: new SystemClock(),
    grader: createGrader(),
    adminKey: process.env.ADMIN_KEY,
  };
}

/** Mongo-backed deps. Caller owns `connection` and must close it on shutdown. */
export async function createMongoDeps(uri: string, dbName: string): Promise<{ deps: AppDeps; connection: MongoConnection }> {
  const connection = await connectMongo(uri, dbName);
  await ensureMongoIndexes(connection.db);
  const deps: AppDeps = {
    repos: createMongoRepos(connection.db),
    recordIds: new MongoRecordIdSource(connection.db),
    clock: new SystemClock(),
    grader: createGrader(),
    adminKey: process.env.ADMIN_KEY,
  };
  return { deps, connection };
}
