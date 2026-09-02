import { describe, expect, it } from 'vitest';
import { formatLocalDateOnly, openSafeHarvestDate, safeHarvestDate } from './safeHarvestDate';

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

// ============================================================
// formatLocalDateOnly.
//
// **The regression is one day, in one direction, and it reached the books.**
// Every hand picked date in the app used to be written with
// `.toISOString().slice(0, 10)` on a Date built from local parts, so a farmer
// in Israel who picked September 2 stored September 1 — and when the date was
// a spray, safeHarvestDate above inherited the error and answered the
// regulatory question a day early. Each assertion here pairs the correct
// answer with what toISOString() would have said, so the two can never
// silently converge again.
//
// **The device is simulated rather than the test runner moved.** Forcing a
// timezone from inside a test means writing process.env.TZ, and that silently
// does nothing when vitest runs the file in a worker thread, which would leave
// the interesting cases passing only on a machine already set to Israel.
// deviceIn below is a real Date whose local getters answer as a device in a
// given timezone would, the same trick voiceClient.test.ts uses on
// deviceToday, so every assertion here holds wherever the suite runs. The
// cases built with `new Date(y, m, d)` need no simulation: local parts in,
// local parts out, true in any timezone.
// ============================================================

function deviceIn(instantUtc: string, year: number, month: number, day: number): Date {
  return Object.assign(new Date(instantUtc), {
    getFullYear: () => year,
    getMonth: () => month - 1,
    getDate: () => day,
  });
}

describe('formatLocalDateOnly', () => {
  // The exact reproduction from the bug report: local midnight on September 2
  // in Israel is 21:00 on September 1 in UTC.
  it('returns the day a local midnight Date actually stands for', () => {
    expect(formatLocalDateOnly(new Date(2026, 8, 2))).toBe('2026-09-02');
  });

  // 2026-09-02T21:30:00Z is already half past midnight on September 3 for a
  // device in Israel, and toISOString() would call it September 2.
  it('returns the local day where the UTC day is still yesterday', () => {
    const instant = deviceIn('2026-09-02T21:30:00Z', 2026, 9, 3);

    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-02');
    expect(formatLocalDateOnly(instant)).toBe('2026-09-03');
  });

  // The same bug in the other direction, for a device west of UTC:
  // 2026-09-02T05:00:00Z is still the evening of September 1 in Hawaii.
  it('returns the local day where the UTC day is already tomorrow', () => {
    const instant = deviceIn('2026-09-02T05:00:00Z', 2026, 9, 1);

    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-02');
    expect(formatLocalDateOnly(instant)).toBe('2026-09-01');
  });

  it('pads a single digit month and day to two digits', () => {
    expect(formatLocalDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatLocalDateOnly(new Date(2026, 8, 9, 23, 59, 59))).toBe('2026-09-09');
  });

  // Four digit years, like formatUtcDateOnly, because the callers hand this
  // straight to a Postgres date column and to isCalendarDate.
  it('pads the year to four digits', () => {
    expect(formatLocalDateOnly(deviceIn('0875-01-01T12:00:00Z', 875, 1, 1))).toBe('0875-01-01');
  });

  // The last minute of a month and of a year, which is where an hour of drift
  // moves the month or the year and not just the day.
  it('holds at a month boundary', () => {
    expect(formatLocalDateOnly(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-31');
    expect(formatLocalDateOnly(new Date(2026, 1, 1, 0, 0))).toBe('2026-02-01');
  });

  it('holds at a year boundary', () => {
    expect(formatLocalDateOnly(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
    expect(formatLocalDateOnly(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  // A leap day, since February 29 is the one date that cannot be produced by
  // rolling a wrong year forward.
  it('holds on a leap day', () => {
    expect(formatLocalDateOnly(new Date(2028, 1, 29))).toBe('2028-02-29');
  });

  it('produces a string isCalendarDate accepts', () => {
    expect(formatLocalDateOnly(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // **The pair, asserted together.** formatUtcDateOnly is not exported, but
  // safeHarvestDate is the thing that consumes it, and it must keep reading a
  // YYYY-MM-DD string as a bare calendar day no matter where the machine is.
  // If someone ever "fixes" that side to local getters too, this fails.
  it('does not change how a YYYY-MM-DD spray date is read', () => {
    expect(safeHarvestDate('2026-09-02', 0)).toBe('2026-09-02');
    expect(safeHarvestDate('2026-09-02', 7)).toBe('2026-09-09');
  });
});
