/**
 * MongoRepository: documented stub (ADR-0002). No `mongodb` dependency in the POC.
 *
 * Production collections: `agents`, `assessments`, `guided_runs`, `readiness_records`.
 * Unique index on `readiness_records.recordId`. Record ids come from a Mongo counter.
 * In production `find` takes a Mongo filter object instead of a predicate, and
 * `insert`/`update` map to insertOne/replaceOne keyed on `id`.
 */
import type { Repository } from './repository';

const NOT_IMPLEMENTED = 'MongoRepository: not implemented in POC';

export class MongoRepository<T extends { id: string }> implements Repository<T> {
  constructor(
    readonly collectionName: string,
    readonly db: unknown,
  ) {}
  insert(_item: T): Promise<T> {
    throw new Error(NOT_IMPLEMENTED);
  }
  getById(_id: string): Promise<T | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
  update(_item: T): Promise<T> {
    throw new Error(NOT_IMPLEMENTED);
  }
  find(_pred: (t: T) => boolean): Promise<T[]> {
    throw new Error(NOT_IMPLEMENTED);
  }
  count(): Promise<number> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
