// A month of days as a grid, and the rules for moving around it.
//
// **The founder, on every date field in this app:** "everywhere there is a date
// and it has to be entered, it is very uncomfortable to set a day and a month.
// I want a calendar to open!" What he was looking at is two small number boxes,
// one for the day and one for the month, with the year inferred behind his back
// (see voicePastDateFromParts). Six screens had them.
//
// **A grid of day squares is the tile pattern he already approved**, not a new
// idea: "I like squares, they are fun, comfortable, big, buttony and pretty."
// So the calendar is built here, out of the same material as TilePicker, rather
// than installed. The other two reasons are recorded in docs/open-items.md and
// still hold: @react-native-community/datetimepicker is a new native dependency
// that would need verifying in Expo Go, and a native OS picker cannot be shared
// with the web client, which has the same complaint.
//
// **Nothing here renders and nothing here imports react.** frontend/mobile and
// frontend/web both have no test runner, so everything about a calendar that can
// be decided away from a screen is decided here: which days a month contains,
// which column each one falls in, what the month navigation does at a year
// boundary, and which days a given field is allowed to accept. What stays in the
// two components is touch and paint.
//
// ============================================================
// Three decisions that are not arithmetic.
//
//   Sunday.        The week starts on Sunday in Israel. Most calendar examples
//                  start on Monday and it is the kind of thing that gets copied
//                  in without being noticed, so the first day of the week is a
//                  named constant with the country in its comment, and every
//                  function that needs it takes it as an argument with that
//                  constant as the default.
//
//   Direction.     An expense and a journal entry record something that already
//                  happened; a task due date is a target. That is not a
//                  presentation difference, it is which half of the calendar is
//                  allowed to be tapped, so it is expressed as bounds --
//                  CalendarDirection turns into a min/max pair and every cell
//                  asks the same question of it. See calendarBounds.
//
//   The value the  A record being edited must always be able to keep the date
//   field holds.   it already has. A task that fell overdue last month is still
//                  a future-direction field, and if the bound were a flat
//                  "today or later" its own due date would render as a day that
//                  cannot be chosen. So the bound is relaxed to include whatever
//                  the field already holds.
// ============================================================

import { formatMonthName } from './format';
import { formatLocalDateOnly, isCalendarDate } from './safeHarvestDate';

// ============================================================
// The week.
//
// 0 is Sunday, matching Date#getDay, so that a weekday number read out of a
// Date and a weekday number used as a column index are the same number.
// ============================================================

// **Israel.** design.md has no calendar in it yet, so this is written from the
// country the product ships in rather than from a spec. It is a default and an
// argument rather than a hardcoded 0 inside the grid builder, so the day a
// second country appears the change is a call site.
export const CALENDAR_WEEK_START = 0;

// Indexed by weekday number, so CALENDAR_WEEKDAY_LABEL_KEYS[0] is Sunday
// whatever the week starts on. calendarWeekdayKeys below is what rotates them
// into column order.
//
// **Keys and not labels**, the same convention sprayDateOptions uses: the
// Hebrew lives in i18n.ts and this module stays testable without a string
// table. They are also not derived from toLocaleDateString: formatMonthName
// takes that route for month names because design.md asks for a real month
// name, but a single Hebrew letter per column is not something worth asking
// Hermes for, and `weekday: 'short'` in he-IL returns "יום א׳", which does not
// fit a column head.
export const CALENDAR_WEEKDAY_LABEL_KEYS: readonly string[] = [
  'date.weekday.sunday',
  'date.weekday.monday',
  'date.weekday.tuesday',
  'date.weekday.wednesday',
  'date.weekday.thursday',
  'date.weekday.friday',
  'date.weekday.saturday',
];

// The label keys for the seven columns, left to right in *logical* order: index
// 0 is the first column of the grid, whichever weekday that is.
//
// **This function is half of how the header is kept honest.** The other half is
// that calendarWeeks puts a day whose weekday is (weekStart + column) % 7 in
// that same column, and a test asserts the two agree for every weekday a month
// can start on. Alignment is therefore a property of the data rather than
// something a stylesheet happens to get right.
export function calendarWeekdayKeys(weekStart: number = CALENDAR_WEEK_START): string[] {
  return Array.from(
    { length: 7 },
    (_, column) => CALENDAR_WEEKDAY_LABEL_KEYS[(weekStart + column) % 7]!,
  );
}

// ============================================================
// A month, and the days in it.
// ============================================================

// month is 1-12, not 0-11. Every value in this module that a person would call
// a month is one-based, because half the off-by-one bugs in date code are the
// boundary between the two conventions and this module has exactly one of them,
// in the two private helpers below.
export type CalendarMonth = { year: number; month: number };

export type CalendarDay = {
  // YYYY-MM-DD, built by string arithmetic and never by formatting a Date.
  date: string;
  day: number;
  // 0-6, 0 = Sunday. Carried on the cell so a component never has to work out
  // which column it is in, and so the header test above has something to check.
  weekday: number;
  isToday: boolean;
  selectable: boolean;
};

// A grid cell with no day in it: the run-up before the 1st and the tail after
// the last. **Empty rather than the neighbouring month's days.** A greyed-out
// "31" from last month next to a live "1" is two kinds of the same-looking
// square, and the reader this app is built for is 55 to 70. Nothing tappable
// ever leaves the month whose name is in the header.
export type CalendarCell = CalendarDay | null;

// Always exactly seven, including the trailing nulls of the last week, so that
// column index means the same thing on every row.
export type CalendarWeek = readonly CalendarCell[];

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function isoDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// **UTC here is correct and it is the one place in this module that touches a
// Date.** safeHarvestDate.ts spells out when each of the two is right: local
// when the Date came off a wall clock, UTC when it carries a calendar day and
// no location. Which weekday the 3rd of September 2026 falls on is a fact about
// the calendar and not about where the reader is standing, so it is built and
// read entirely in UTC. Reading it with getDay() off a local midnight Date
// would be the same answer everywhere anyway, but only by accident.
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Day 0 of the following month is the last day of this one, which is where the
// leap-year rule comes from instead of being written out again.
export function daysInCalendarMonth(month: CalendarMonth): number {
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}

// How many empty cells come before the 1st. 0 when the month starts on the
// first day of the week.
export function calendarMonthStartOffset(
  month: CalendarMonth,
  weekStart: number = CALENDAR_WEEK_START,
): number {
  return (weekdayOf(month.year, month.month, 1) - weekStart + 7) % 7;
}

// **Split, not `new Date(value)`.** A YYYY-MM-DD string parses as UTC midnight
// and reading getMonth() off it west of UTC gives the previous month, which for
// a calendar means opening on the wrong page. The ban is written out at the
// bottom of safeHarvestDate.ts and this is the same trap from the other side.
export function calendarMonthOfDate(date: string): CalendarMonth | null {
  if (!isCalendarDate(date)) return null;
  const [year, month] = date.split('-');
  return { year: Number(year), month: Number(month) };
}

// **Which page the calendar opens on, and it is the whole of the reachability
// answer for the ordinary case.** A field that already holds a date opens on
// that date's month, so editing last month's expense costs no navigation at
// all; an empty field opens on today. Nobody arrives at a calendar showing a
// month they did not ask for.
export function calendarViewMonth(selected: string | null, today: string): CalendarMonth {
  const fromSelected = selected === null ? null : calendarMonthOfDate(selected);
  return fromSelected ?? calendarMonthOfDate(today) ?? { year: 1970, month: 1 };
}

// Month arithmetic done on a single running count of months, so December to
// January is the same line of code as March to April and there is no year
// boundary to get wrong.
export function shiftCalendarMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const index = month.year * 12 + (month.month - 1) + delta;
  const year = Math.floor(index / 12);
  return { year, month: index - year * 12 + 1 };
}

export function sameCalendarMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

// ============================================================
// What a field is allowed to accept.
//
// **Past-only versus future-allowed is a per-use bound, not a per-component
// habit.** computeExpenseDate and computeLogDate rolled a future day/month back
// a year; computeDueDate rolled a past one forward. Those were the same rule
// pointing in opposite directions, written out by hand in five components, and
// they only existed because a two-box form has no way to say "not that one".
// A calendar does: the day is simply not tappable.
//
// **What changed for the farmer, and it is a widening rather than a swap.** The
// old boxes could only ever produce a date inside a twelve-month window either
// side of today, because the year was guessed from the day and month. A journal
// entry from two seasons ago was not reachable at all. With a calendar it is,
// by paging back, and the direction bound is what stops him filing this
// season's spray under next year.
// ============================================================

export type CalendarDirection =
  // Expenses and journal entries: they record something that has happened.
  | 'past'
  // Task due dates: they are a target.
  | 'future'
  // No bound. Nothing uses it today; it exists so that a field which genuinely
  // accepts both does not have to pass a fake one.
  | 'any';

export type CalendarBounds = { min: string | null; max: string | null };

export const CALENDAR_NO_BOUNDS: CalendarBounds = { min: null, max: null };

// `selected` is what the field currently holds, and it relaxes the bound rather
// than being checked against it. See the header: a task that fell overdue is
// still a future-direction field, and its own due date has to stay tappable, or
// opening the sheet to change the title would show a date the calendar says is
// not allowed.
export function calendarBounds(
  direction: CalendarDirection,
  today: string,
  selected: string | null,
): CalendarBounds {
  const held = selected !== null && isCalendarDate(selected) ? selected : null;
  if (direction === 'past') {
    return { min: null, max: held !== null && held > today ? held : today };
  }
  if (direction === 'future') {
    return { min: held !== null && held < today ? held : today, max: null };
  }
  return CALENDAR_NO_BOUNDS;
}

// Comparing YYYY-MM-DD strings is a valid chronological comparison, which is
// why nothing here parses a Date to answer a question about order.
// openSafeHarvestDate already leans on the same property.
export function isSelectableDate(date: string, bounds: CalendarBounds): boolean {
  if (bounds.min !== null && date < bounds.min) return false;
  if (bounds.max !== null && date > bounds.max) return false;
  return true;
}

// **Whether the arrow is offered at all**, asked of the month it would land on
// rather than of the day. A past-only field greys out "next month" once the
// farmer is looking at the current one, which is worth more than it sounds: it
// is the thing that stops him paging forward into a wall of untappable squares
// and losing track of where he is.
export function canShiftCalendarMonth(
  month: CalendarMonth,
  delta: number,
  bounds: CalendarBounds,
): boolean {
  const target = shiftCalendarMonth(month, delta);
  const first = isoDate(target.year, target.month, 1);
  const last = isoDate(target.year, target.month, daysInCalendarMonth(target));
  if (bounds.min !== null && last < bounds.min) return false;
  if (bounds.max !== null && first > bounds.max) return false;
  return true;
}

// ============================================================
// The grid.
// ============================================================

// Rows of seven, starting with the run-up nulls before the 1st and ending with
// however many nulls the last week needs.
//
// **The number of rows is the month's own, four to six, and is not padded to a
// fixed six.** A February that starts on a Sunday is four rows, and two empty
// rows underneath it would be a large hole in a sheet. What a changing height
// would otherwise cost is a control moving under a thumb between months, and
// that is paid for in the components instead: the month name and both arrows
// sit *above* the grid, so nothing a farmer is aiming at moves when the grid
// grows or shrinks below it.
export function calendarWeeks(
  month: CalendarMonth,
  today: string,
  bounds: CalendarBounds,
  weekStart: number = CALENDAR_WEEK_START,
): CalendarWeek[] {
  const offset = calendarMonthStartOffset(month, weekStart);
  const length = daysInCalendarMonth(month);
  const weeks: CalendarCell[][] = [];

  for (let cell = 0; cell < offset + length; cell += 1) {
    if (cell % 7 === 0) weeks.push([]);
    const week = weeks[weeks.length - 1]!;
    if (cell < offset) {
      week.push(null);
      continue;
    }
    const day = cell - offset + 1;
    const date = isoDate(month.year, month.month, day);
    week.push({
      date,
      day,
      weekday: (weekStart + (cell % 7)) % 7,
      isToday: date === today,
      selectable: isSelectableDate(date, bounds),
    });
  }

  // The tail. Without it the last row is short and every column index below it
  // means something different, which is exactly the alignment the header
  // depends on.
  const last = weeks[weeks.length - 1];
  if (last) {
    while (last.length < 7) last.push(null);
  }
  return weeks;
}

// ============================================================
// Reading a date back out.
// ============================================================

// The month name and the year, for the header of the grid. **The year is not
// decoration**: it is the only thing on screen that tells a farmer who has
// paged back a long way where he actually is, and the old two-box form never
// showed him a year at all.
//
// formatMonthName is given a *local* Date built from the parts, not the
// YYYY-MM-DD string. Handing it the string would parse UTC midnight and print
// the previous month for any reader behind UTC.
export function calendarMonthLabel(month: CalendarMonth): string {
  return `${formatMonthName(new Date(month.year, month.month - 1, 1))} ${month.year}`;
}

// "3.9.2026". Split rather than parsed, for the reason given at
// calendarMonthOfDate, and with the year included because this string is what a
// closed date field shows and a date with no year is the ambiguity the calendar
// was built to remove.
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-');
  if (year === undefined || month === undefined || day === undefined) return date;
  return `${Number(day)}.${Number(month)}.${Number(year)}`;
}

// ============================================================
// The three shortcuts.
//
// **The calendar does not replace these and was never meant to.** A spray, an
// expense and a journal entry are written the evening they happened or the
// morning after, so the overwhelmingly common answer is one of three squares
// and the grid is the way out for the rest. This is the builder the spray flow
// has used since the tiles landed, moved here because the expense sheet and the
// journal sheet want exactly the same three and a second copy of "yesterday"
// is how two screens end up disagreeing about what yesterday is.
//
// Built by walking a local Date back a day at a time and reading it with
// formatLocalDateOnly. toISOString would make every one of them a day early
// after 21:00 or 22:00 Israel time.
// ============================================================

export type RecentDateOption = { date: string; labelKey: string };

const RECENT_DATE_LABEL_KEYS = ['date.today', 'date.yesterday', 'date.dayBefore'];

export function recentDateOptions(now: Date): RecentDateOption[] {
  return RECENT_DATE_LABEL_KEYS.map((labelKey, daysBack) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    return { date: formatLocalDateOnly(day), labelKey };
  });
}
