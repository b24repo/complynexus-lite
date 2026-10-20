import { randomUUID } from 'node:crypto';

export function nextRecordId(year: number, seq: number): string {
  return `CNL-${year}-${String(seq).padStart(4, '0')}`;
}

export function uuid(): string {
  return randomUUID();
}

/** Produces the next public record id (CNL-YYYY-NNNN); the sequence restarts each year. */
export interface RecordIdSource {
  next(year: number): Promise<string>;
}

export class InMemoryRecordIdSource implements RecordIdSource {
  private readonly seqs = new Map<number, number>();
  async next(year: number): Promise<string> {
    const seq = (this.seqs.get(year) ?? 0) + 1;
    this.seqs.set(year, seq);
    return nextRecordId(year, seq);
  }
}
