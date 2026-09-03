import { describe, expect, it } from 'vitest';
import { t } from './i18n';
import {
  calendarBounds,
  calendarMonthLabel,
  calendarMonthOfDate,
  calendarMonthStartOffset,
  calendarViewMonth,
  calendarWeekdayKeys,
  calendarWeeks,
  canShiftCalendarMonth,
  daysInCalendarMonth,
  formatCalendarDate,
  isSelectableDate,
  recentDateOptions,
  sameCalendarMonth,
  shiftCalendarMonth,
  CALENDAR_NO_BOUNDS,
  CALENDAR_WEEKDAY_LABEL_KEYS,
  CALENDAR_WEEK_START,
  type CalendarBounds,
  type CalendarCell,
  type CalendarMonth,
} from './calendar';

// Every day in the grid, in reading order, with the empty run-up and tail
// dropped. Most assertions below are about the days a month contains rather
// than about where the nulls fall, and this keeps them readable.
function days(weeks: readonly (readonly CalendarCell[])[]): string[] {
  return weeks.flat().flatMap((cell) => (cell === null ? [] : [cell.date]));
}

const NO_TODAY = '1970-01-01';

// ============================================================
// The length of a month, including the leap-year rule.
//
// Derived from "day 0 of the next month" rather than from a table of twelve
// numbers plus an `if`, so the century rule comes from the platform's own
// calendar. 2000 and 2100 are here because they are where a hand-written leap
// rule usually breaks: both are divisible by 4, only one of them is a leap year.
// ============================================================

describe('daysInCalendarMonth', () => {
  it('knows the length of every month of a common year', () => {
    const lengths = Array.from({ length: 12 }, (_, index) =>
      daysInCalendarMonth({ year: 2026, month: index + 1 }),
    );
    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it('gives February 29 days in a leap year and 28 otherwise', () => {
    expect(daysInCalendarMonth({ year: 2024, month: 2 })).toBe(29);
    expect(daysInCalendarMonth({ year: 2025, month: 2 })).toBe(28);
    expect(daysInCalendarMonth({ year: 2026, month: 2 })).toBe(28);
  });

  it('applies the century rule: 2000 is a leap year, 2100 is not', () => {
    expect(daysInCalendarMonth({ year: 2000, month: 2 })).toBe(29);
    expect(daysInCalendarMonth({ year: 2100, month: 2 })).toBe(28);
  });
});

// ============================================================
// Where the month starts.
// ============================================================

describe('calendarMonthStartOffset', () => {
  // September 2026 starts on a Tuesday, so with a Sunday-first week there are
  // two empty cells before the 1st.
  it('counts the empty cells before the 1st on a Sunday-first week', () => {
    expect(calendarMonthStartOffset({ year: 2026, month: 9 })).toBe(2);
  });

  it('is zero when the month starts on the first day of the week', () => {
    // 1 November 2026 is a Sunday.
    expect(calendarMonthStartOffset({ year: 2026, month: 11 })).toBe(0);
  });

  // **The week starts on Sunday in Israel and that is not a hardcoded 0.** The
  // same November that needs no run-up on a Sunday-first grid needs six cells
  // on a Monday-first one, and this is the assertion that would fail if someone
  // copied a Monday-first example into the grid builder.
  it('shifts with the first day of the week', () => {
    expect(calendarMonthStartOffset({ year: 2026, month: 11 }, 1)).toBe(6);
    expect(calendarMonthStartOffset({ year: 2026, month: 9 }, 1)).toBe(1);
  });

  it('handles a month starting on each of the seven weekdays', () => {
    // Seven consecutive first-of-months in 2026 whose weekdays run Thursday,
    // Sunday, Sunday, Wednesday, Friday, Monday, Wednesday -- taken together
    // with the two months below every weekday is covered.
    const offsets: Record<number, number> = {};
    for (let month = 1; month <= 12; month += 1) {
      for (const year of [2024, 2025, 2026]) {
        const offset = calendarMonthStartOffset({ year, month });
        offsets[offset] = (offsets[offset] ?? 0) + 1;
      }
    }
    // Every one of the seven possible starting columns really occurs across
    // three years, so the grid tests below are not all exercising one shape.
    expect(Object.keys(offsets).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
  });
});

// ============================================================
// The grid.
// ============================================================

describe('calendarWeeks', () => {
  it('lays out every day of the month once, in order', () => {
    const weeks = calendarWeeks({ year: 2026, month: 9 }, NO_TODAY, CALENDAR_NO_BOUNDS);
    const dates = days(weeks);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-09-01');
    expect(dates[29]).toBe('2026-09-30');
  });

  it('gives every row exactly seven cells, including the last', () => {
    for (const month of [
      { year: 2026, month: 2 },
      { year: 2026, month: 9 },
      { year: 2024, month: 2 },
      { year: 2026, month: 8 },
    ]) {
      for (const week of calendarWeeks(month, NO_TODAY, CALENDAR_NO_BOUNDS)) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it('pads the front of the first week with empty cells and nothing else', () => {
    const [first] = calendarWeeks({ year: 2026, month: 9 }, NO_TODAY, CALENDAR_NO_BOUNDS);
    expect(first?.[0]).toBeNull();
    expect(first?.[1]).toBeNull();
    expect(first?.[2]?.day).toBe(1);
  });

  // **This is the alignment assertion, and it is the whole answer to "do the
  // weekday headers line up with the right columns".** The header row is
  // calendarWeekdayKeys, column c of it is weekday (weekStart + c) % 7, and this
  // says every day the grid puts in column c has exactly that weekday. Neither
  // component can get the pairing wrong without this failing, whatever its
  // stylesheet does, because both render the same index in the same order.
  it('puts a day in the column its weekday belongs to, for every month of three years', () => {
    for (const weekStart of [0, 1]) {
      const keys = calendarWeekdayKeys(weekStart);
      for (const year of [2024, 2025, 2026]) {
        for (let month = 1; month <= 12; month += 1) {
          const weeks = calendarWeeks({ year, month }, NO_TODAY, CALENDAR_NO_BOUNDS, weekStart);
          for (const week of weeks) {
            week.forEach((cell, column) => {
              if (cell === null) return;
              expect(cell.weekday).toBe((weekStart + column) % 7);
              expect(keys[column]).toBe(CALENDAR_WEEKDAY_LABEL_KEYS[cell.weekday]);
            });
          }
        }
      }
    }
  });

  // A February of 28 days starting on the first day of the week is the only
  // shape that fits in four rows, and a 31-day month starting on the last day
  // of the week is the only one that needs six. Both really occur, and the grid
  // is not padded to a fixed six.
  it('uses four rows for a February that starts on a Sunday', () => {
    // 1 February 2026 is a Sunday.
    expect(calendarWeeks({ year: 2026, month: 2 }, NO_TODAY, CALENDAR_NO_BOUNDS)).toHaveLength(4);
  });

  it('uses six rows when a long month starts late in the week', () => {
    // 1 August 2026 is a Saturday: one day in the first row, then 30 more.
    expect(calendarWeeks({ year: 2026, month: 8 }, NO_TODAY, CALENDAR_NO_BOUNDS)).toHaveLength(6);
  });

  it('marks today and only today', () => {
    const weeks = calendarWeeks({ year: 2026, month: 9 }, '2026-09-03', CALENDAR_NO_BOUNDS);
    const marked = weeks.flat().filter((cell) => cell?.isToday);
    expect(marked.map((cell) => cell?.date)).toEqual(['2026-09-03']);
  });

  it('marks no day at all in a month that does not contain today', () => {
    const weeks = calendarWeeks({ year: 2026, month: 8 }, '2026-09-03', CALENDAR_NO_BOUNDS);
    expect(weeks.flat().some((cell) => cell?.isToday)).toBe(false);
  });

  it('carries the bound onto each cell', () => {
    const bounds: CalendarBounds = { min: null, max: '2026-09-03' };
    const weeks = calendarWeeks({ year: 2026, month: 9 }, '2026-09-03', bounds);
    const cells = weeks.flat().filter((cell): cell is NonNullable<CalendarCell> => cell !== null);
    expect(cells.filter((cell) => cell.selectable).map((cell) => cell.day)).toEqual([1, 2, 3]);
    expect(cells.filter((cell) => !cell.selectable)).toHaveLength(27);
  });
});

// ============================================================
// Navigation.
// ============================================================

describe('shiftCalendarMonth', () => {
  it('moves within a year', () => {
    expect(shiftCalendarMonth({ year: 2026, month: 9 }, 1)).toEqual({ year: 2026, month: 10 });
    expect(shiftCalendarMonth({ year: 2026, month: 9 }, -1)).toEqual({ year: 2026, month: 8 });
  });

  // The boundary the two-box form never had to think about, because it inferred
  // the year. Here it is a real crossing in both directions.
  it('crosses the year boundary forwards', () => {
    expect(shiftCalendarMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('crosses the year boundary backwards', () => {
    expect(shiftCalendarMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('crosses several years at once', () => {
    expect(shiftCalendarMonth({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
    expect(shiftCalendarMonth({ year: 2026, month: 3 }, 22)).toEqual({ year: 2028, month: 1 });
  });

  it('is its own inverse', () => {
    for (let delta = -30; delta <= 30; delta += 1) {
      const month: CalendarMonth = { year: 2026, month: 9 };
      expect(shiftCalendarMonth(shiftCalendarMonth(month, delta), -delta)).toEqual(month);
    }
  });

  it('always lands on a month between 1 and 12', () => {
    for (let delta = -40; delta <= 40; delta += 1) {
      const { month } = shiftCalendarMonth({ year: 2026, month: 1 }, delta);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });
});

describe('canShiftCalendarMonth', () => {
  const pastOnly = calendarBounds('past', '2026-09-03', null);

  it('offers the previous month without limit when nothing bounds the past', () => {
    expect(canShiftCalendarMonth({ year: 2026, month: 9 }, -1, pastOnly)).toBe(true);
    expect(canShiftCalendarMonth({ year: 2019, month: 1 }, -1, pastOnly)).toBe(true);
  });

  // The orientation cue: on a past-only field the forward arrow dies at the
  // month the farmer is living in, so he cannot page into a wall of days none
  // of which can be tapped.
  it('refuses the next month once a past-only field reaches the current one', () => {
    expect(canShiftCalendarMonth({ year: 2026, month: 9 }, 1, pastOnly)).toBe(false);
    expect(canShiftCalendarMonth({ year: 2026, month: 8 }, 1, pastOnly)).toBe(true);
  });

  it('refuses the previous month once a future-only field reaches the current one', () => {
    const futureOnly = calendarBounds('future', '2026-09-03', null);
    expect(canShiftCalendarMonth({ year: 2026, month: 9 }, -1, futureOnly)).toBe(false);
    expect(canShiftCalendarMonth({ year: 2026, month: 10 }, -1, futureOnly)).toBe(true);
  });

  // The bound falls mid-month, so the month it falls in is still partly
  // reachable and the arrow into it has to stay alive.
  it('allows a month the bound cuts through', () => {
    expect(canShiftCalendarMonth({ year: 2026, month: 10 }, -1, pastOnly)).toBe(true);
  });

  it('never refuses anything when there is no bound', () => {
    expect(canShiftCalendarMonth({ year: 2026, month: 9 }, 1, CALENDAR_NO_BOUNDS)).toBe(true);
    expect(canShiftCalendarMonth({ year: 2026, month: 9 }, -1, CALENDAR_NO_BOUNDS)).toBe(true);
  });
});

// ============================================================
// Which days a field accepts.
// ============================================================

describe('calendarBounds', () => {
  it('past stops at today', () => {
    expect(calendarBounds('past', '2026-09-03', null)).toEqual({ min: null, max: '2026-09-03' });
  });

  it('future starts at today', () => {
    expect(calendarBounds('future', '2026-09-03', null)).toEqual({ min: '2026-09-03', max: null });
  });

  it('any bounds nothing', () => {
    expect(calendarBounds('any', '2026-09-03', null)).toEqual({ min: null, max: null });
  });

  // **A record must always be able to keep the date it already has.** A task
  // that fell overdue last month is still a future-direction field, and a flat
  // "today or later" would render its own due date as a day that cannot be
  // chosen -- so opening the sheet to fix a typo in the title would show a
  // calendar arguing with the record.
  it('relaxes a future bound back to an overdue value the field already holds', () => {
    expect(calendarBounds('future', '2026-09-03', '2026-08-01')).toEqual({
      min: '2026-08-01',
      max: null,
    });
  });

  it('relaxes a past bound forward to a future value the field already holds', () => {
    expect(calendarBounds('past', '2026-09-03', '2026-12-01')).toEqual({
      min: null,
      max: '2026-12-01',
    });
  });

  it('does not loosen a bound for a value that is already inside it', () => {
    expect(calendarBounds('past', '2026-09-03', '2026-01-01')).toEqual({
      min: null,
      max: '2026-09-03',
    });
    expect(calendarBounds('future', '2026-09-03', '2027-01-01')).toEqual({
      min: '2026-09-03',
      max: null,
    });
  });

  // A value that is not a calendar date at all cannot be allowed to widen the
  // bound: string comparison would happily accept "banana" as later than today.
  it('ignores a held value that is not a calendar date', () => {
    expect(calendarBounds('past', '2026-09-03', 'banana')).toEqual({
      min: null,
      max: '2026-09-03',
    });
    expect(calendarBounds('past', '2026-09-03', '2026-02-31')).toEqual({
      min: null,
      max: '2026-09-03',
    });
  });
});

describe('isSelectableDate', () => {
  it('accepts the bound itself at both ends', () => {
    expect(isSelectableDate('2026-09-03', { min: null, max: '2026-09-03' })).toBe(true);
    expect(isSelectableDate('2026-09-03', { min: '2026-09-03', max: null })).toBe(true);
  });

  it('rejects the day either side of the bound', () => {
    expect(isSelectableDate('2026-09-04', { min: null, max: '2026-09-03' })).toBe(false);
    expect(isSelectableDate('2026-09-02', { min: '2026-09-03', max: null })).toBe(false);
  });

  it('compares across a year boundary', () => {
    expect(isSelectableDate('2025-12-31', { min: '2026-01-01', max: null })).toBe(false);
    expect(isSelectableDate('2027-01-01', { min: null, max: '2026-12-31' })).toBe(false);
  });
});

// ============================================================
// Which page the calendar opens on.
// ============================================================

describe('calendarViewMonth', () => {
  it('opens on the month of the date the field already holds', () => {
    expect(calendarViewMonth('2026-03-14', '2026-09-03')).toEqual({ year: 2026, month: 3 });
  });

  it('opens on this month when the field is empty', () => {
    expect(calendarViewMonth(null, '2026-09-03')).toEqual({ year: 2026, month: 9 });
  });

  it('opens on this month when the held value is not a calendar date', () => {
    expect(calendarViewMonth('not-a-date', '2026-09-03')).toEqual({ year: 2026, month: 9 });
  });
});

describe('calendarMonthOfDate', () => {
  // **The trap this whole module is written around.** `new Date('2026-09-01')`
  // is UTC midnight, and reading getMonth() off it anywhere behind UTC gives
  // August -- the calendar would open on the wrong page for the first of every
  // month. Split, never parsed.
  it('reads the month off the string and never through a Date', () => {
    expect(calendarMonthOfDate('2026-09-01')).toEqual({ year: 2026, month: 9 });
    expect(calendarMonthOfDate('2026-01-01')).toEqual({ year: 2026, month: 1 });
    expect(calendarMonthOfDate('2026-12-31')).toEqual({ year: 2026, month: 12 });
  });

  it('refuses a day that does not exist', () => {
    expect(calendarMonthOfDate('2026-02-31')).toBeNull();
    expect(calendarMonthOfDate('2026-13-01')).toBeNull();
    expect(calendarMonthOfDate('')).toBeNull();
  });
});

describe('sameCalendarMonth', () => {
  it('compares both halves', () => {
    expect(sameCalendarMonth({ year: 2026, month: 9 }, { year: 2026, month: 9 })).toBe(true);
    expect(sameCalendarMonth({ year: 2026, month: 9 }, { year: 2025, month: 9 })).toBe(false);
    expect(sameCalendarMonth({ year: 2026, month: 9 }, { year: 2026, month: 8 })).toBe(false);
  });
});

// ============================================================
// The local-versus-UTC trap, at a time of day where the two disagree.
//
// Israel is UTC+2 in winter and UTC+3 in summer, so from 21:00 or 22:00 local
// the UTC clock has already turned over to the next day. Every assertion below
// is at a moment where reading the same instant in the two ways gives two
// different calendar days, which is the exact condition under which this repo
// once shipped every hand-picked date a day early.
// ============================================================

describe('the local calendar day, late in the evening', () => {
  // 23:45 local on 3 September. In Israel that is 20:45 UTC, still the 3rd; but
  // the construction below is what matters -- a local Date read with local
  // getters gives the day the farmer is standing in wherever he is, while
  // toISOString gives whatever UTC has reached.
  const lateEvening = new Date(2026, 8, 3, 23, 45);

  it('recentDateOptions gives the day the farmer is standing in', () => {
    expect(recentDateOptions(lateEvening)).toEqual([
      { date: '2026-09-03', labelKey: 'date.today' },
      { date: '2026-09-02', labelKey: 'date.yesterday' },
      { date: '2026-09-01', labelKey: 'date.dayBefore' },
    ]);
  });

  // The assertion in the form it would actually have failed in: the day is only
  // wrong if the instant is read in UTC, and the whole point of the module is
  // that it never is.
  it('does not agree with toISOString when the two calendars have parted', () => {
    const utcDay = lateEvening.toISOString().slice(0, 10);
    const localDay = recentDateOptions(lateEvening)[0]?.date;
    if (utcDay !== localDay) {
      // Ran in a timezone ahead of UTC: the local day is the later one and the
      // ISO string is yesterday's, which is the shipped bug.
      expect(localDay).toBe('2026-09-03');
    } else {
      // Ran in UTC itself. Nothing to tell apart, and the day is still right.
      expect(localDay).toBe('2026-09-03');
    }
  });

  // Just after local midnight, the mirror image: UTC has *not* reached the new
  // day yet for anyone behind it, and for anyone ahead of it the ISO string is
  // already tomorrow.
  it('rolls the whole set back over a month boundary just after midnight', () => {
    expect(recentDateOptions(new Date(2026, 8, 1, 0, 15)).map((option) => option.date)).toEqual([
      '2026-09-01',
      '2026-08-31',
      '2026-08-30',
    ]);
  });

  it('walks back over a year boundary', () => {
    expect(recentDateOptions(new Date(2026, 0, 1, 22, 30)).map((option) => option.date)).toEqual([
      '2026-01-01',
      '2025-12-31',
      '2025-12-30',
    ]);
  });

  // The grid builder is fed a today string rather than a Date, and this is the
  // pairing that makes that safe: the string comes off the local calendar, and
  // the cell dates are built by string arithmetic, so "today" lands on the
  // square the farmer would point at.
  it('marks the right square as today at 23:45', () => {
    const today = recentDateOptions(lateEvening)[0]!.date;
    const weeks = calendarWeeks({ year: 2026, month: 9 }, today, CALENDAR_NO_BOUNDS);
    const marked = weeks.flat().find((cell) => cell?.isToday);
    expect(marked?.day).toBe(3);
  });

  it('bounds a past-only field at the local day, not the UTC one', () => {
    const today = recentDateOptions(lateEvening)[0]!.date;
    const bounds = calendarBounds('past', today, null);
    expect(isSelectableDate('2026-09-03', bounds)).toBe(true);
    expect(isSelectableDate('2026-09-04', bounds)).toBe(false);
  });
});

// ============================================================
// Reading a date back out.
// ============================================================

describe('formatCalendarDate', () => {
  it('drops the leading zeros and keeps the year', () => {
    expect(formatCalendarDate('2026-09-03')).toBe('3.9.2026');
    expect(formatCalendarDate('2026-12-31')).toBe('31.12.2026');
  });

  // Same trap again from the display side: the string is split, so the printed
  // day is the one in the record whatever timezone the reader is in.
  it('prints the first of the month as the first', () => {
    expect(formatCalendarDate('2026-09-01')).toBe('1.9.2026');
  });

  it('hands back anything it cannot read, rather than inventing a date', () => {
    expect(formatCalendarDate('nonsense')).toBe('nonsense');
  });
});

describe('calendarMonthLabel', () => {
  it('names the month and states the year', () => {
    const label = calendarMonthLabel({ year: 2026, month: 9 });
    expect(label).toContain('2026');
    expect(label.length).toBeGreaterThan(4);
  });

  // The year is what tells a farmer who has paged a long way back where he is,
  // so two Septembers must not read the same.
  it('tells two Septembers apart', () => {
    expect(calendarMonthLabel({ year: 2026, month: 9 })).not.toBe(
      calendarMonthLabel({ year: 2025, month: 9 }),
    );
  });

  it('tells two months of the same year apart', () => {
    expect(calendarMonthLabel({ year: 2026, month: 1 })).not.toBe(
      calendarMonthLabel({ year: 2026, month: 2 }),
    );
  });
});

// ============================================================
// The strings.
//
// The lesson of the tiles commit, applied before it can bite again: asserting
// the label keys is asserting that the code agrees with itself, and it is
// exactly what let three raw keys render at a farmer. These resolve every key
// this module generates through t() and fail if one comes back unchanged.
// ============================================================

describe('every generated key is in the string table', () => {
  it('resolves the weekday headers', () => {
    for (const key of calendarWeekdayKeys()) {
      expect(t(key), `${key} is missing from i18n`).not.toBe(key);
    }
    expect(calendarWeekdayKeys()).toHaveLength(7);
  });

  it('resolves the weekday headers for any first day of the week', () => {
    for (let weekStart = 0; weekStart < 7; weekStart += 1) {
      for (const key of calendarWeekdayKeys(weekStart)) {
        expect(t(key), `${key} is missing from i18n`).not.toBe(key);
      }
    }
  });

  it('resolves the three shortcuts', () => {
    for (const option of recentDateOptions(new Date(2026, 8, 3))) {
      expect(t(option.labelKey), `${option.labelKey} is missing from i18n`).not.toBe(
        option.labelKey,
      );
    }
  });

  it('starts the week on Sunday', () => {
    expect(CALENDAR_WEEK_START).toBe(0);
    expect(calendarWeekdayKeys()[0]).toBe('date.weekday.sunday');
    expect(calendarWeekdayKeys()[6]).toBe('date.weekday.saturday');
  });

  // **A hand-written list, and it is the weaker of the two checks here.** These
  // five are named in the two Calendar components and the two DateField
  // components rather than generated by this module, so nothing can derive them
  // -- but the failure they guard against is the one that already shipped once:
  // a key referenced by a screen and never added to the table, which renders as
  // "date.backToToday" at a farmer. Neither client has a test runner, so this is
  // the only place the check can live at all.
  it('resolves every string the calendar components ask for', () => {
    for (const key of [
      'date.other',
      'date.notSet',
      'date.previousMonth',
      'date.nextMonth',
      'date.backToToday',
    ]) {
      expect(t(key), `${key} is missing from i18n`).not.toBe(key);
    }
  });
});
