/**
 * MongoRepository (ADR-0005). Documents are stored as `{ _id: item.id, ...item }`;
 * `_id` is stripped on read. All timestamps in the domain are ISO strings and are
 * stored/returned verbatim. Writes clone the input; reads return fresh objects.
 */
import { MongoServerError } from 'mongodb';
import type { Collection, Db, Filter } from 'mongodb';
import type { Repository, Repos } from './repository';
import type { Agent, Assessment, GuidedRun, ReadinessRecord } from '../../domain/types';

type Doc<T> = T & { _id: string };

export const COLLECTIONS = {
  agents: 'agents',
  assessments: 'assessments',
  runs: 'guided_runs',
  records: 'readiness_records',
} as const;

function strip<T extends { id: string }>(doc: Doc<T>): T {
  const { _id: _ignored, ...rest } = doc;
  return rest as unknown as T;
}

export class MongoRepository<T extends { id: string }> implements Repository<T> {
  private readonly col: Collection<Doc<T>>;

  constructor(
    db: Db,
    readonly collectionName: string,
  ) {
    this.col = db.collection<Doc<T>>(collectionName);
  }

  async insert(item: T): Promise<T> {
    const doc = { _id: item.id, ...structuredClone(item) } as Doc<T>;
    try {
      await this.col.insertOne(doc as never);
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) throw new Error(`Duplicate id ${item.id}`);
      throw err;
    }
    return structuredClone(item);
  }

  async getById(id: string): Promise<T | null> {
    const found = await this.col.findOne({ _id: id } as Filter<Doc<T>>);
    return found ? strip(found as Doc<T>) : null;
  }

  async update(item: T): Promise<T> {
    const doc = { _id: item.id, ...structuredClone(item) } as Doc<T>;
    const res = await this.col.replaceOne({ _id: item.id } as Filter<Doc<T>>, doc);
    if (res.matchedCount === 0) throw new Error(`Unknown id ${item.id}`);
    return structuredClone(item);
  }

  async find(pred: (t: T) => boolean, where?: Partial<T>): Promise<T[]> {
    const docs = await this.col.find((where ?? {}) as Filter<Doc<T>>).toArray();
    return docs.map((d) => strip(d as Doc<T>)).filter(pred);
  }

  async count(): Promise<number> {
    return this.col.countDocuments({});
  }
}

export function createMongoRepos(db: Db): Repos {
  return {
    agents: new MongoRepository<Agent>(db, COLLECTIONS.agents),
    assessments: new MongoRepository<Assessment>(db, COLLECTIONS.assessments),
    runs: new MongoRepository<GuidedRun>(db, COLLECTIONS.runs),
    records: new MongoRepository<ReadinessRecord>(db, COLLECTIONS.records),
  };
}

/** Idempotent; safe to call on every boot. */
export async function ensureMongoIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTIONS.records).createIndex({ recordId: 1 }, { unique: true, name: 'uniq_recordId' });
  await db.collection(COLLECTIONS.records).createIndex({ agentId: 1 }, { name: 'agentId' });
  await db.collection(COLLECTIONS.assessments).createIndex({ agentId: 1, version: -1 }, { name: 'agentId_version' });
  await db.collection(COLLECTIONS.runs).createIndex({ agentId: 1, runNumber: -1 }, { name: 'agentId_runNumber' });
}
