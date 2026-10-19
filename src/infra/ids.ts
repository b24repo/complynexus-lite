import { randomUUID } from 'node:crypto';

export function nextRecordId(year: number, seq: number): string {
  return `CNL-${year}-${String(seq).padStart(4, '0')}`;
}

export function uuid(): string {
  return randomUUID();
}
