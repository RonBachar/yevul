import { describe, expect, it } from 'vitest';
import { safeHarvestDate } from './safeHarvestDate';

describe('safeHarvestDate', () => {
  it('adds the PHI days to a YYYY-MM-DD spray date', () => {
    expect(safeHarvestDate('2026-08-20', 7)).toBe('2026-08-27');
  });

  it('crosses a month boundary correctly', () => {
    expect(safeHarvestDate('2026-08-28', 7)).toBe('2026-09-04');
  });

  it('crosses a year boundary correctly', () => {
    expect(safeHarvestDate('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('handles leap-year February', () => {
    expect(safeHarvestDate('2028-02-27', 3)).toBe('2028-03-01');
  });

  it('treats zero PHI days as same-day safe', () => {
    expect(safeHarvestDate('2026-08-20', 0)).toBe('2026-08-20');
  });

  it('accepts a Date object and normalizes to a date-only string', () => {
    expect(safeHarvestDate(new Date(Date.UTC(2026, 7, 20)), 7)).toBe('2026-08-27');
  });

  it('ignores a time component on an ISO string, no timezone drift', () => {
    expect(safeHarvestDate('2026-08-20T23:30:00Z', 7)).toBe('2026-08-27');
  });

  it('returns null when PHI days is null (not a spray, or unknown)', () => {
    expect(safeHarvestDate('2026-08-20', null)).toBeNull();
  });

  it('returns null when PHI days is undefined', () => {
    expect(safeHarvestDate('2026-08-20', undefined)).toBeNull();
  });

  it('returns null for a malformed date string', () => {
    expect(safeHarvestDate('not-a-date', 7)).toBeNull();
  });

  it('returns null for an impossible calendar date', () => {
    expect(safeHarvestDate('2026-02-31', 7)).toBeNull();
  });
});
