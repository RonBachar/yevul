import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCalendarDate, recentDateOptions, t, type CalendarDirection } from '@yevul/shared';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { Calendar } from './Calendar';

// One date field, used by every sheet in the app that asks for a date.
//
// **The two number boxes are gone from all of them.** What a farmer had to do
// before was type a day into one box and a month into another, with the year
// inferred behind his back from which side of today the pair landed on. The
// founder's verdict was one sentence: "it is very uncomfortable... I want a
// calendar to open!"
//
// ---- Why the shortcuts survived ----
//
// The spray flow already offered today / yesterday / the day before as squares,
// and those are right: a spray, an expense or a journal entry is written the
// evening it happened or the morning after, so the common answer is one tap and
// the grid is for the rest. **A calendar that replaced them would have made the
// ordinary case slower**, which is the opposite of what was asked for. So they
// are here too, and this component is why the expense sheet and the journal
// sheet now have them at all -- they never did.
//
// They are chips and not TilePicker squares, and that is a space decision
// rather than a change of mind. This field sits inside a form with four other
// rows; three 48%-wide squares plus a month of days underneath would push the
// save button off a phone. The founder's actual complaint about chips was the
// horizontal ScrollView -- "the options are in a sliding strip, the single most
// uncomfortable thing about the experience" -- and nothing here scrolls
// sideways: the row wraps, so every option is on screen. The spray walk keeps
// its squares, because there the date is the only thing on the screen.
//
// ---- What is open when it opens ----
//
// The grid stays folded away while one of the shortcuts is the answer, and
// unfolds by itself when the field holds a date that is none of them -- editing
// last month's expense shows the month it is in, already open, with the day
// marked. A field with no shortcuts at all (a task due date; see below) has
// nothing to fold, so its grid is simply always open.
//
// ---- Direction ----
//
// `direction` is passed straight to the calendar and decides which half of it
// can be tapped. 'past' for an expense and a journal entry, which record what
// has happened; 'future' for a task due date, which is a target. That was the
// rule computeExpenseDate, computeLogDate and computeDueDate each implemented
// by hand as a year-guess; it is now a bound, and the days it excludes are
// visibly not tappable instead of silently landing in another year.

export function DateField({
  label,
  value,
  onChange,
  direction,
  // Whether to offer today / yesterday / the day before above the grid. On for
  // everything that records the past; off for a task due date, where all three
  // point the wrong way and the sheet's own "someday / this week / by a date"
  // chips are the forward-looking equivalent.
  shortcuts = true,
  // When given, a chip that clears the date. Only the voice confirmation's task
  // due date needs one, because "no due date" is a real task there and the
  // manual task sheet expresses the same thing with its own chips.
  clearLabel,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  direction: CalendarDirection;
  shortcuts?: boolean;
  clearLabel?: string;
  disabled?: boolean;
}) {
  // **Recomputed every render, deliberately not memoised on mount.** A
  // BottomSheet stays mounted underneath its closed Modal -- that is the whole
  // reason every sheet in this app re-initialises its fields in an effect on
  // `visible` -- so a `useMemo` with no dependency on the day would freeze
  // these three for the life of the process and label yesterday "today" on the
  // second morning. Three short strings per render is not a cost worth a bug.
  const options = shortcuts ? recentDateOptions(new Date()) : [];
  const collapsible = options.length > 0;

  // **Derived from the value, with the toggle as an override that expires when
  // the value moves.** For the same mounted-forever reason, a plain useState
  // initialiser would decide once, on the first record this field ever showed,
  // and every later one would inherit its answer. So the default is a fact
  // about the value -- a date that is none of the shortcuts wants its month on
  // screen -- and pressing the toggle overrides it only until the value
  // changes, which is exactly when the question is worth re-asking.
  const [toggle, setToggle] = useState<{ open: boolean; source: string | null } | null>(null);
  const unfolded = value !== null && !options.some((option) => option.date === value);
  const open = toggle !== null && toggle.source === value ? toggle.open : unfolded;
  // A field with nothing to fold behind is always open, so that clearing the
  // date on such a field cannot fold away the only control it has.
  const showCalendar = !collapsible || open;

  const busy = disabled === true;

  return (
    <View style={formStyles.field}>
      <View style={styles.labelRow}>
        <Text style={formStyles.label}>{label}</Text>
        {/* What is actually set, in full, always on screen. The old two boxes
            showed a day and a month and never the year they had guessed. */}
        <Text style={styles.value}>
          {value === null ? t('date.notSet') : formatCalendarDate(value)}
        </Text>
      </View>

      {collapsible || clearLabel !== undefined ? (
        <View style={formStyles.chips}>
          {options.map((option) => {
            const active = option.date === value;
            return (
              <Pressable
                key={option.date}
                style={[formStyles.chip, active && formStyles.chipActive]}
                onPress={() => onChange(option.date)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: busy }}
              >
                <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}

          {clearLabel !== undefined ? (
            <Pressable
              style={[formStyles.chip, value === null && formStyles.chipActive]}
              onPress={() => onChange(null)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === null, disabled: busy }}
            >
              <Text style={[formStyles.chipText, value === null && formStyles.chipTextActive]}>
                {clearLabel}
              </Text>
            </Pressable>
          ) : null}

          {collapsible ? (
            <Pressable
              style={[formStyles.chip, open && formStyles.chipActive]}
              onPress={() => setToggle({ open: !open, source: value })}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ expanded: open, disabled: busy }}
            >
              <Text style={[formStyles.chipText, open && formStyles.chipTextActive]}>
                {t('date.other')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showCalendar ? (
        <Calendar value={value} onSelect={onChange} direction={direction} disabled={busy} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    // Reversed so the label keeps the right-hand start it has in every other
    // form row and the chosen date sits at the far end of it. Not read off
    // I18nManager the way the calendar grid is: a two-item row that came out
    // the wrong way round is a cosmetic annoyance, while a calendar grid that
    // did would put the wrong weekday over every column.
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s8,
  },
  value: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
  },
});
