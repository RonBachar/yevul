import { describe, expect, it } from 'vitest';
import { openSafeHarvestDate, safeHarvestDate } from './safeHarvestDate';

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

// הצ'יפ "בטוח לקטיף מ-…" בטאב צפי ההכנסה, design.md. זהו חישוב
// רגולטורי, ולכן הבדיקות כאן שומרות בעיקר על כלל ההחמרה: כשיש כמה
// ריסוסים פתוחים, המאוחר שבהם קובע.
describe('openSafeHarvestDate', () => {
  const now = new Date('2026-08-29T10:00:00Z');

  it('returns the safe-harvest date of an open spray', () => {
    expect(openSafeHarvestDate([{ date: '2026-08-27', sprayPhiDays: 7 }], now)).toBe('2026-09-03');
  });

  // ריסוס אחד שפג אינו מבטל ריסוס אחר שעדיין בתוקף.
  it('picks the latest date when several sprays are still open', () => {
    const entries = [
      { date: '2026-08-25', sprayPhiDays: 7 }, // 2026-09-01
      { date: '2026-08-27', sprayPhiDays: 14 }, // 2026-09-10, המחמיר
      { date: '2026-08-26', sprayPhiDays: 3 }, // 2026-08-29, כבר הגיע
    ];
    expect(openSafeHarvestDate(entries, now)).toBe('2026-09-10');
  });

  it('ignores sprays whose safe-harvest date has already arrived', () => {
    expect(openSafeHarvestDate([{ date: '2026-08-01', sprayPhiDays: 7 }], now)).toBeNull();
  });

  // היום עצמו כבר בטוח, ולכן אינו "פתוח" ואינו מציג צ'יפ.
  it('treats today as already safe, not as open', () => {
    expect(openSafeHarvestDate([{ date: '2026-08-22', sprayPhiDays: 7 }], now)).toBeNull();
  });

  // חוסר מידע אינו הופך חלקה לבטוחה ואינו חוסם אותה, הוא פשוט לא משתתף.
  it('skips entries without PHI days or with a malformed date', () => {
    const entries = [
      { date: '2026-08-27', sprayPhiDays: null },
      { date: 'not-a-date', sprayPhiDays: 7 },
    ];
    expect(openSafeHarvestDate(entries, now)).toBeNull();
  });

  it('returns null when the plot has no spray entries at all', () => {
    expect(openSafeHarvestDate([], now)).toBeNull();
  });
});
