import { useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
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
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';

// A month of days as squares. The founder: "everywhere there is a date and it
// has to be entered it is very uncomfortable to set a day and a month. I want a
// calendar to open!"
//
// **Everything that can be decided without a screen is decided in
// packages/shared/src/calendar.ts and tested there**, for the reason sprayEntry,
// sheetDrag and voiceConfirm live there: frontend/mobile has no test runner.
// Which days the month has, which column each falls in, what the arrows do at a
// year boundary and which days this field may accept are all answered before
// this file runs. What is left here is touch and paint.
//
// ---- Reading direction ----
//
// **Sunday is the right-hand column.** This is a Hebrew app for Israel, a
// printed Israeli calendar runs right to left, and א must sit over the same
// column as the 1st of a month that starts on a Sunday.
//
// The mobile app does not call I18nManager.forceRTL -- there is no such call
// anywhere in frontend/mobile, and Hebrew alignment is done per-Text with
// textAlign and writingDirection. So a plain `row` lays out left to right here
// and `row-reverse` is what puts the first child on the right. **That would
// silently invert the whole calendar the day somebody does turn forced RTL on**,
// because RN flips the meaning of both values, so the direction is read off
// I18nManager rather than assumed. isRTL is fixed for the life of the process
// (changing it requires a restart), which is why it can be resolved once here.
//
// The header reverses with it, so "previous month" is on the right where back
// belongs in Hebrew, and its chevron points right for the same reason.
//
// ---- The size of a day ----
//
// Height is touchTarget.min, from the tokens, never a number typed in here.
// **Width is what a week leaves and it is the one dimension that cannot also be
// 48.** Seven columns inside a sheet padded by spacing.s24 comes to roughly 45
// to 49 points on the phones this app runs on -- above the 44 point floor both
// platforms publish, and the only way to widen it is to show fewer than seven
// days in a week, which is not a calendar. Height is the dimension a thumb
// misses on, and height is held.
const ROW_DIRECTION = I18nManager.isRTL ? ('row' as const) : ('row-reverse' as const);

export function Calendar({
  value,
  onSelect,
  direction,
  disabled,
}: {
  // YYYY-MM-DD, or null when the field has no date yet.
  value: string | null;
  onSelect: (date: string) => void;
  // Which half of the calendar this field accepts. See calendarBounds: an
  // expense and a journal entry record what has happened, a task due date is a
  // target, and the bound always stretches to include the date the field is
  // already holding so an edit can keep it.
  direction: CalendarDirection;
  disabled?: boolean;
}) {
  // Recomputed each render rather than frozen at mount, so a sheet left open
  // across midnight does not keep calling yesterday "today". formatLocalDateOnly
  // and never toISOString -- see the bottom of safeHarvestDate.ts.
  const today = formatLocalDateOnly(new Date());
  const bounds = calendarBounds(direction, today, value);

  // **The month on screen is derived, not synced.** It is held as state so the
  // arrows can move it, alongside the value it was derived from; when the value
  // changes from outside -- a "yesterday" tile tapped while August is on screen
  // -- the pair no longer matches and the month is recomputed from the new
  // value. An effect doing the same job would run a render late and would fight
  // the arrows for ownership of the same piece of state.
  const [view, setView] = useState<{ month: CalendarMonth; source: string | null }>(() => ({
    month: calendarViewMonth(value, today),
    source: value,
  }));
  const month = view.source === value ? view.month : calendarViewMonth(value, today);

  const busy = disabled === true;
  const weeks = calendarWeeks(month, today, bounds);
  const weekdayKeys = calendarWeekdayKeys();
  const todayMonth = calendarMonthOfDate(today);
  const showTodayLink = todayMonth !== null && !sameCalendarMonth(month, todayMonth);

  function goTo(next: CalendarMonth) {
    setView({ month: next, source: value });
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <MonthArrow
          labelKey="date.previousMonth"
          back
          disabled={busy || !canShiftCalendarMonth(month, -1, bounds)}
          onPress={() => goTo(shiftCalendarMonth(month, -1))}
        />
        {/* The year is on screen at all times and that is not decoration: it is
            the only thing telling a farmer who has paged a long way back where
            he actually is, and the two number boxes this replaces never showed
            him a year at all. */}
        <Text style={styles.monthLabel}>{calendarMonthLabel(month)}</Text>
        <MonthArrow
          labelKey="date.nextMonth"
          back={false}
          disabled={busy || !canShiftCalendarMonth(month, 1, bounds)}
          onPress={() => goTo(shiftCalendarMonth(month, 1))}
        />
      </View>

      {/* **The one-tap way back from anywhere**, offered only when he is not
          already here. Paging is how a distant month is reached, and this is
          what stops paging from being a way to get lost: however far he has
          wandered, home is one press and it is named. */}
      {showTodayLink && todayMonth !== null ? (
        <Pressable
          style={styles.todayLink}
          onPress={() => goTo(todayMonth)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.todayLinkText}>{t('date.backToToday')}</Text>
        </Pressable>
      ) : null}

      {/* Seven headers and seven cells per row, in the same order, in rows with
          the same flexDirection. Column alignment is therefore structural: the
          shared package puts a day whose weekday is (weekStart + column) % 7 in
          that column and a test asserts it for every month of three years, so
          א cannot drift off Sunday without that test failing. */}
      <View style={styles.weekdays}>
        {weekdayKeys.map((key) => (
          <Text key={key} style={styles.weekdayText}>
            {t(key)}
          </Text>
        ))}
      </View>

      {weeks.map((week, index) => (
        <View key={`${month.year}-${month.month}-${index}`} style={styles.week}>
          {week.map((cell, column) =>
            cell === null ? (
              <View key={`empty-${column}`} style={styles.empty} />
            ) : (
              <Pressable
                key={cell.date}
                style={[
                  styles.day,
                  cell.isToday && styles.dayToday,
                  cell.date === value && styles.daySelected,
                  !cell.selectable && styles.dayBlocked,
                ]}
                onPress={() => onSelect(cell.date)}
                disabled={busy || !cell.selectable}
                accessibilityRole="button"
                // The cell shows a bare number; the whole date is what a screen
                // reader needs to say which square this is.
                accessibilityLabel={formatCalendarDate(cell.date)}
                accessibilityState={{ selected: cell.date === value, disabled: !cell.selectable }}
              >
                <Text
                  style={[
                    styles.dayText,
                    cell.isToday && styles.dayTextToday,
                    cell.date === value && styles.dayTextSelected,
                    !cell.selectable && styles.dayTextBlocked,
                  ]}
                >
                  {cell.day}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

// **Back points right, and it does so unconditionally.** The header row uses
// ROW_DIRECTION, which puts the previous-month button on the right whichever
// way I18nManager is set, so the glyph does not have to be conditional too --
// and it must not be, because React Native mirrors layout under forced RTL but
// never mirrors the contents of an SVG.
//
// The word is the accessibility label rather than on screen: two spelled-out
// month names either side of a third would leave nothing for the grid.
function MonthArrow({
  labelKey,
  back,
  disabled,
  onPress,
}: {
  labelKey: string;
  back: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const Icon = back ? ChevronRight : ChevronLeft;
  return (
    <Pressable
      style={[styles.arrow, disabled && styles.arrowDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t(labelKey)}
      accessibilityState={{ disabled }}
    >
      <Icon size={24} strokeWidth={2} color={disabled ? colors.slate600 : colors.field700} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.s8,
  },
  // Above the grid, deliberately. The number of rows is the month's own, four
  // to six, so the grid changes height between months -- and with the controls
  // on top, nothing a farmer is aiming at moves when it does.
  header: {
    flexDirection: ROW_DIRECTION,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.4,
  },
  monthLabel: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.ink900,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  todayLink: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayLinkText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
  weekdays: {
    flexDirection: ROW_DIRECTION,
  },
  weekdayText: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
  },
  week: {
    flexDirection: ROW_DIRECTION,
  },
  empty: {
    flex: 1,
    margin: 1,
  },
  // The touch target. minHeight comes from the tokens and the margin sits
  // outside it, so the hairline between squares never eats into the target.
  day: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
    borderRadius: radius.input,
    backgroundColor: colors.mist100,
  },
  // Today is marked in every month view, not only when it is the chosen day,
  // because it is the landmark the rest of the grid is read against.
  dayToday: {
    backgroundColor: colors.field100,
  },
  // The same Field-700 on Field-100 pair that TilePicker and formStyles.chip
  // use for a made choice, at full strength: a chosen day is filled rather than
  // outlined, so it is the one square on the page that cannot be mistaken.
  daySelected: {
    backgroundColor: colors.field700,
  },
  // A day this field does not accept -- after today on an expense, before today
  // on a task due date. Shown rather than removed: a farmer has to be able to
  // see the whole month to know where he is in it.
  dayBlocked: {
    backgroundColor: colors.paper,
    opacity: 0.45,
  },
  dayText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
  },
  dayTextToday: {
    color: colors.field700,
  },
  dayTextSelected: {
    color: colors.paper,
  },
  dayTextBlocked: {
    color: colors.slate600,
  },
});
