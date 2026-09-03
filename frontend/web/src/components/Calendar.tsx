import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  calendarBounds,
  calendarMonthLabel,
  calendarMonthOfDate,
  calendarViewMonth,
  calendarWeekdayKeys,
  calendarWeeks,
  canShiftCalendarMonth,
  formatCalendarDate,
  formatLocalDateOnly,
  sameCalendarMonth,
  shiftCalendarMonth,
  t,
  type CalendarDirection,
  type CalendarMonth,
} from '@yevul/shared';
import './Calendar.css';

// A month of days as squares, in the browser. The mobile component's twin, and
// deliberately its twin rather than its cousin: **both read the same tested
// module in packages/shared**, so which days a month has, which column each
// falls in, what the arrows do at a year boundary and which days this field may
// accept are one answer rather than two that can drift.
//
// **This is the second reason the work was not an installed date picker.** A
// native OS picker cannot be shared with the web client, and the founder's
// complaint applies to both. What was here before was `<input type="date">`,
// which is not the two number boxes the mobile app had but is its own kind of
// wrong for this user: a text box with a small icon at one end, whose popup is
// whatever the browser feels like and whose keyboard entry expects a format
// nobody announced. Now the two clients look and behave the same.
//
// ---- Reading direction ----
//
// Sunday is the right-hand column, as on every printed Israeli calendar. The
// document is already dir="rtl", so the grid would come out right by
// inheritance -- the stylesheet states direction: rtl on the grid anyway,
// because a calendar's column order is not a thing to leave implicit. The
// header, being a plain flex row, inherits RTL from the document, which puts
// the previous-month button on the right where "back" belongs in Hebrew.
//
// The weekday headers and the day cells are children of one grid, so header
// column c and day column c are the same column by construction. What guarantees
// the *pairing* is in the shared package: a day whose weekday is
// (weekStart + c) % 7 goes in column c, and a test asserts it for every month of
// three years.

export function Calendar({
  value,
  onSelect,
  direction,
  disabled,
}: {
  // YYYY-MM-DD, or null when the field has no date yet.
  value: string | null;
  onSelect: (date: string) => void;
  // Which half of the calendar this field accepts. See calendarBounds.
  direction: CalendarDirection;
  disabled?: boolean;
}) {
  // Recomputed each render rather than frozen at mount, so a dialog left open
  // across midnight does not keep calling yesterday "today". formatLocalDateOnly
  // and never toISOString: from local midnight until 02:00 or 03:00 Israel is on
  // a date UTC has not reached.
  const today = formatLocalDateOnly(new Date());
  const bounds = calendarBounds(direction, today, value);

  // **Derived, not synced.** The month is state so the arrows can move it, held
  // beside the value it came from; when the value changes from outside -- a
  // "yesterday" chip clicked while August is on screen -- the pair no longer
  // matches and the month is recomputed. An effect would run a render late and
  // would fight the arrows for the same piece of state.
  const [view, setView] = useState<{ month: CalendarMonth; source: string | null }>(() => ({
    month: calendarViewMonth(value, today),
    source: value,
  }));
  const month = view.source === value ? view.month : calendarViewMonth(value, today);

  const busy = disabled === true;
  const weeks = calendarWeeks(month, today, bounds);
  const todayMonth = calendarMonthOfDate(today);
  const showTodayLink = todayMonth !== null && !sameCalendarMonth(month, todayMonth);

  function goTo(next: CalendarMonth) {
    setView({ month: next, source: value });
  }

  return (
    <div className="calendar">
      <div className="calendar__header">
        {/* Back points right. The header is RTL, so the previous-month button
            is the right-hand one and its glyph agrees with where it sits. */}
        <button
          type="button"
          className="calendar__arrow"
          onClick={() => goTo(shiftCalendarMonth(month, -1))}
          disabled={busy || !canShiftCalendarMonth(month, -1, bounds)}
          aria-label={t('date.previousMonth')}
        >
          <ChevronRight size={24} strokeWidth={2} aria-hidden />
        </button>
        {/* The year is not decoration: it is the only thing telling someone who
            has paged a long way back where he is. */}
        <h3 className="calendar__month">{calendarMonthLabel(month)}</h3>
        <button
          type="button"
          className="calendar__arrow"
          onClick={() => goTo(shiftCalendarMonth(month, 1))}
          disabled={busy || !canShiftCalendarMonth(month, 1, bounds)}
          aria-label={t('date.nextMonth')}
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {showTodayLink && todayMonth !== null && (
        <button
          type="button"
          className="calendar__today"
          onClick={() => goTo(todayMonth)}
          disabled={busy}
        >
          {t('date.backToToday')}
        </button>
      )}

      <div className="calendar__grid">
        {calendarWeekdayKeys().map((key) => (
          <div key={key} className="calendar__weekday" aria-hidden>
            {t(key)}
          </div>
        ))}

        {weeks.map((week, index) =>
          week.map((cell, column) =>
            cell === null ? (
              <div
                key={`empty-${month.year}-${month.month}-${index}-${column}`}
                className="calendar__empty"
              />
            ) : (
              <button
                key={cell.date}
                type="button"
                className={[
                  'calendar__day',
                  cell.isToday ? 'calendar__day--today' : '',
                  cell.date === value ? 'calendar__day--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(cell.date)}
                disabled={busy || !cell.selectable}
                // The cell shows a bare number; the whole date is what a screen
                // reader needs, which is also why the weekday headers above are
                // aria-hidden rather than read out before every day.
                aria-label={formatCalendarDate(cell.date)}
                aria-pressed={cell.date === value}
              >
                {cell.day}
              </button>
            ),
          ),
        )}
      </div>
    </div>
  );
}
