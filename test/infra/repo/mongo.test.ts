import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLECTIONS, MongoLoginTokenStore, MongoRepository, createMongoRepos, ensureMongoIndexes } from '../../../src/infra/repo/mongo';
import { MongoRecordIdSource } from '../../../src/infra/repo/mongoIds';
import { loginTokenStoreContract } from './loginTokenStoreContract';
import { repositoryContract } from './repositoryContract';
import type { Doc } from './repositoryContract';

const skip = process.env.SKIP_MONGO_TESTS === '1';

describe.skipIf(skip)('MongoRepository (mongodb-memory-server)', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let n = 0;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION ?? '8.2.6' } });
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('contract');
  }, 180_000);

  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });

  repositoryContract('MongoRepository', async () => new MongoRepository<Doc>(db, `contract_${++n}`));

  loginTokenStoreContract('MongoLoginTokenStore', async () => new MongoLoginTokenStore(db, `tokens_${++n}`));

  it('createMongoRepos uses the production collection names', async () => {
    const repos = createMongoRepos(db);
    expect((repos.agents as MongoRepository<never>).collectionName).toBe('agents');
    expect((repos.assessments as MongoRepository<never>).collectionName).toBe('assessments');
    expect((repos.runs as MongoRepository<never>).collectionName).toBe('guided_runs');
    expect((repos.records as MongoRepository<never>).collectionName).toBe('readiness_records');
    expect((repos.founders as MongoRepository<never>).collectionName).toBe('founders');
    expect((repos.loginTokens as unknown as MongoRepository<never>).collectionName).toBe('login_tokens');
    expect((repos.sessions as MongoRepository<never>).collectionName).toBe('sessions');
  });

  it('ensureMongoIndexes is idempotent and enforces a unique recordId', async () => {
    await ensureMongoIndexes(db);
    await ensureMongoIndexes(db);
    const names = (await db.collection(COLLECTIONS.records).indexes()).map((i) => i.name);
    expect(names).toContain('uniq_recordId');
    const col = db.collection<{ _id: string; id: string; recordId: string; agentId: string }>(COLLECTIONS.records);
    await col.insertOne({ _id: 'x1', id: 'x1', recordId: 'CNL-2026-0001', agentId: 'a' });
    await expect(col.insertOne({ _id: 'x2', id: 'x2', recordId: 'CNL-2026-0001', agentId: 'b' })).rejects.toThrow(/E11000/);
  });

  it('creates the auth indexes: unique founder email and TTL on tokens and sessions', async () => {
    await ensureMongoIndexes(db);
    const founderIdx = await db.collection(COLLECTIONS.founders).indexes();
    expect(founderIdx.find((i) => i.name === 'uniq_email')?.unique).toBe(true);
    for (const c of [COLLECTIONS.loginTokens, COLLECTIONS.sessions]) {
      const ttl = (await db.collection(c).indexes()).find((i) => i.name === 'ttl_expiresAt');
      expect(ttl?.expireAfterSeconds).toBe(0);
    }
    const repos = createMongoRepos(client.db('auth_idx'));
    await ensureMongoIndexes(client.db('auth_idx'));
    await repos.founders.insert({ id: 'f1', email: 'a@example.com', createdAt: '2026-12-01T00:00:00.000Z' });
    await expect(
      repos.founders.insert({ id: 'f2', email: 'a@example.com', createdAt: '2026-12-01T00:00:00.000Z' }),
    ).rejects.toThrow(/Duplicate id/);
  });

  describe('MongoRecordIdSource', () => {
    it('produces CNL-YYYY-NNNN, sequential per year, independent across years', async () => {
      const ids = new MongoRecordIdSource(client.db('ids_1'));
      expect(await ids.next(2026)).toBe('CNL-2026-0001');
      expect(await ids.next(2026)).toBe('CNL-2026-0002');
      expect(await ids.next(2027)).toBe('CNL-2027-0001');
      expect(await ids.next(2026)).toBe('CNL-2026-0003');
    });
    it('is unique under concurrency', async () => {
      const ids = new MongoRecordIdSource(client.db('ids_2'));
      const out = await Promise.all(Array.from({ length: 25 }, () => ids.next(2026)));
      expect(new Set(out).size).toBe(25);
      expect(out.sort()).toEqual(Array.from({ length: 25 }, (_, i) => `CNL-2026-${String(i + 1).padStart(4, '0')}`));
    });
  });
});
