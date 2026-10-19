import { describe, expect, it } from 'vitest';
import { addDays, addMonths, formatDate, isAfter } from '../../src/domain/dates';

describe('dates', () => {
  it('addDays(15 Oct 2026, 30) is 14 Nov 2026', () => {
    expect(addDays('2026-10-15T00:00:00Z', 30).toISOString().slice(0, 10)).toBe('2026-11-14');
  });
  it('addMonths(28 Oct 2026, 3) is 28 Jan 2027', () => {
    expect(addMonths('2026-10-28T00:00:00Z', 3).toISOString().slice(0, 10)).toBe('2027-01-28');
  });
  it('addMonths clamps 31 Jan + 1 month to 28 Feb', () => {
    expect(addMonths('2027-01-31T00:00:00Z', 1).toISOString().slice(0, 10)).toBe('2027-02-28');
  });
  it("formatDate renders '12 Oct 2026'", () => {
    expect(formatDate('2026-10-12T23:30:00Z')).toBe('12 Oct 2026');
  });
  it('isAfter compares instants and accepts Date objects', () => {
    expect(isAfter(new Date('2026-10-02'), '2026-10-01')).toBe(true);
    expect(isAfter('2026-10-01', new Date('2026-10-01'))).toBe(false);
  });
});
