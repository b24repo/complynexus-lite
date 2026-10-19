# ADR-0002: Repository interface over MongoDB

Status: accepted (Sprint 0)

## Context
Production target is MongoDB. The POC must run and test without a database.

## Decision
- `Repository<T extends { id: string }>` with `insert`, `getById`, `update`, `find`, `count`
  (`src/infra/repo/repository.ts`). `Repos` groups agents, assessments, runs and records.
- `InMemoryRepository` (Map plus structured clones) is the default and the only implementation
  used in tests. `MongoRepository` is a documented stub with no `mongodb` dependency.
- A record's `id` equals its public `recordId` (`CNL-YYYY-NNNN`).

## Consequences
- `find` takes a predicate here; in Mongo it becomes a filter object.
- Record ids come from an in-memory sequence; production needs a Mongo counter and a unique
  index on `recordId`.
