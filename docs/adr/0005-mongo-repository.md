# ADR-0005: MongoRepository and Mongo record-id counter

Status: accepted

## Context
ADR-0002 left `MongoRepository` as a stub. The POC now needs a real MongoDB implementation that
behaves like the in-memory one, plus a durable source for public record ids.

## Decision
- Driver: `mongodb@7.7.0`.
- `find(pred, where?)`: `where` is an equality filter used as an index hint; the predicate stays
  authoritative. Mongo runs `find(where ?? {})` and then applies `pred`.
- Documents are stored as `{ _id: id, ...item }`; `_id` is stripped on read. Writes and reads
  clone, so callers never share state with the store.
- Collections: `agents`, `assessments`, `guided_runs`, `readiness_records`.
- Indexes, created idempotently at boot: `uniq_recordId` (unique), `agentId`, `agentId_version`,
  `agentId_runNumber`.
- Record ids: `counters` collection, `_id: 'readiness_records:<year>'`, `$inc` upsert; the
  sequence is per year. `RecordIdSource` is injected as `AppDeps.recordIds` (in-memory map in tests).
- Timestamps stay ISO strings.
- Wiring: `MONGODB_URI` and `MONGODB_DB`; without a URI the server runs in memory.
- A shared contract suite runs against both implementations. Mongo runs on
  `mongodb-memory-server@11.3.0` (MongoDB 8.2.6); on in CI, `SKIP_MONGO_TESTS=1` skips it.

## Consequences
- `find` without `where` scans the collection; all current callers pass `agentId`.
- A `recordId` index collision surfaces as "Duplicate id".
- When switching an existing database on, seed `counters` with the max existing NNNN.
- The scheduler (L-31) is still out of scope.
