# ADR-0002: Repository interface over MongoDB

Status: accepted (Sprint 0); Mongo implementation superseded by ADR-0005

## Context
Production target is MongoDB. The POC must run and test without a database.

## Decision
- `Repository<T extends { id: string }>` with `insert`, `getById`, `update`, `find`, `count`
  (`src/infra/repo/repository.ts`). `Repos` groups agents, assessments, runs and records.
- `InMemoryRepository` (Map plus structured clones) is the default and the only implementation
  used in tests. `MongoRepository` is implemented in `src/infra/repo/mongo.ts` (ADR-0005).
- A record's `id` equals its public `recordId` (`CNL-YYYY-NNNN`).

## Consequences
- `find` keeps a predicate and gains an optional equality filter (ADR-0005).
- Record ids come from `RecordIdSource`: in-memory per-year map in tests, Mongo counter in
  production (ADR-0005).
