import { describe, expect, it } from 'vitest';
import { InMemoryRecordIdSource, nextRecordId } from '../../src/infra/ids';

describe('record ids', () => {
  it('nextRecordId pads to four digits', () => {
    expect(nextRecordId(2026, 7)).toBe('CNL-2026-0007');
  });
  it('InMemoryRecordIdSource is sequential per year and independent across years', async () => {
    const ids = new InMemoryRecordIdSource();
    expect(await ids.next(2026)).toBe('CNL-2026-0001');
    expect(await ids.next(2026)).toBe('CNL-2026-0002');
    expect(await ids.next(2027)).toBe('CNL-2027-0001');
    expect(await ids.next(2026)).toBe('CNL-2026-0003');
  });
});
