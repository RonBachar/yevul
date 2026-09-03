import { useState } from 'react';
import { formatCalendarDate, recentDateOptions, t, type CalendarDirection } from '@yevul/shared';
import { Calendar } from './Calendar';
import './Calendar.css';

// One date field, used by every dialog in the web client that asks for a date.
// The twin of frontend/mobile/src/components/DateField.tsx, down to which
// shortcuts are offered and when the grid is already unfolded.
//
// **What it replaced here was `<input type="date">`, not the two number boxes.**
// The mobile sheets typed a day and a month; the browser had a native date
// input, and the older comments in these files say so explicitly ("a native
// date field, because the constraint that ruled a native picker out on mobile
// does not apply here"). It was the better of the two and it is still not what
// was asked for: a text box with an icon at one end, a popup that differs by
// browser, and typed entry in a format nobody states. The founder's sentence
// covers it -- everywhere a date is entered, a calendar should open -- and now
// the two clients answer him the same way.
//
// The shortcuts and the direction rule are explained in full in the mobile
// twin's header; the short version is that today / yesterday / the day before
// stay because they are the answer most of the time, and `direction` decides
// which half of the calendar can be clicked.

export function DateField({
  id,
  label,
  value,
  onChange,
  direction,
  shortcuts = true,
  clearLabel,
  disabled,
}: {
  // Only used to tie the visible label to the field for a screen reader. There
  // is no input element to point htmlFor at -- the control is a grid of buttons
  // -- so the group is labelled by the same text instead.
  id: string;
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  direction: CalendarDirection;
  shortcuts?: boolean;
  clearLabel?: string;
  disabled?: boolean;
}) {
  // Recomputed every render rather than memoised on mount: a Modal keeps its
  // children mounted while closed, so a frozen set of three would still be
  // calling yesterday "today" the following morning.
  const options = shortcuts ? recentDateOptions(new Date()) : [];
  const collapsible = options.length > 0;

  // **Derived from the value, with the toggle as an override that expires when
  // the value moves.** For the same still-mounted reason, a plain useState
  // initialiser would decide once, on the first record this field ever showed.
  // The default is a fact about the value -- a date that is none of the
  // shortcuts wants its month on screen -- and the toggle overrides it only
  // until the value changes.
  const [toggle, setToggle] = useState<{ open: boolean; source: string | null } | null>(null);
  const unfolded = value !== null && !options.some((option) => option.date === value);
  const open = toggle !== null && toggle.source === value ? toggle.open : unfolded;
  // A field with nothing to fold behind is always open, so that clearing the
  // date cannot fold away the only control it has.
  const showCalendar = !collapsible || open;

  const busy = disabled === true;

  function chipClass(active: boolean): string {
    return active ? 'date-field__chip date-field__chip--active' : 'date-field__chip';
  }

  return (
    <div className="form__row" role="group" aria-labelledby={id}>
      <div className="date-field__label-row">
        <span className="form__label" id={id}>
          {label}
        </span>
        {/* What is actually set, in full and with its year. */}
        <span className="date-field__value">
          {value === null ? t('date.notSet') : formatCalendarDate(value)}
        </span>
      </div>

      {(collapsible || clearLabel !== undefined) && (
        <div className="date-field__shortcuts">
          {options.map((option) => (
            <button
              key={option.date}
              type="button"
              className={chipClass(option.date === value)}
              onClick={() => onChange(option.date)}
              disabled={busy}
              aria-pressed={option.date === value}
            >
              {t(option.labelKey)}
            </button>
          ))}

          {clearLabel !== undefined && (
            <button
              type="button"
              className={chipClass(value === null)}
              onClick={() => onChange(null)}
              disabled={busy}
              aria-pressed={value === null}
            >
              {clearLabel}
            </button>
          )}

          {collapsible && (
            <button
              type="button"
              className={chipClass(open)}
              onClick={() => setToggle({ open: !open, source: value })}
              disabled={busy}
              aria-expanded={open}
            >
              {t('date.other')}
            </button>
          )}
        </div>
      )}

      {showCalendar && (
        <Calendar value={value} onSelect={onChange} direction={direction} disabled={busy} />
      )}
    </div>
  );
}
