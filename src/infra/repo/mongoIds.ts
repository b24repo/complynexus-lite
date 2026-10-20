import type { Db } from 'mongodb';
import { nextRecordId } from '../ids';
import type { RecordIdSource } from '../ids';

interface CounterDoc {
  _id: string;
  seq: number;
}

export const COUNTERS_COLLECTION = 'counters';

/** Atomic per-year sequence: counters/{ _id: 'readiness_records:<year>', seq }. */
export class MongoRecordIdSource implements RecordIdSource {
  constructor(private readonly db: Db) {}

  async next(year: number): Promise<string> {
    const doc = await this.db
      .collection<CounterDoc>(COUNTERS_COLLECTION)
      .findOneAndUpdate(
        { _id: `readiness_records:${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
    if (!doc) throw new Error('MongoRecordIdSource: counter upsert returned no document');
    return nextRecordId(year, doc.seq);
  }
}
