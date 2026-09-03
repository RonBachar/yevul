import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';

// Picking one value out of a grid of large squares, two to a row.
//
// **This is the data-entry pattern for this app, not a component built for one
// screen.** The founder's instruction: "in the app, wherever data is entered,
// it should always be squares... big tappable squares: pest type, material,
// dose, waiting days, plot name and date. I like squares, they are fun,
// comfortable, big, buttony and pretty." And on what he was replacing:
// "the options are in a sliding strip, that is the single most uncomfortable
// thing about the experience, simply appalling."
//
// He is right about the strip, and the reason is measurable rather than a
// matter of taste. A horizontal ScrollView of chips shows the first two options
// and hides the rest behind a gesture with no on-screen sign that there is
// anything to scroll to. For a farmer of 55 to 70 who has never been told the
// row slides, the options that are off screen do not exist. Every one of those
// strips in this app -- entry type, plot, suggestions -- is a list of things he
// cannot see.
//
// **What a tile is.** One value, one tap, a target of touchTarget.primary
// (64pt) high and roughly half the sheet wide. Nothing inside it is separately
// tappable, so there is no way to press it and miss.
//
// **Two per row, fixed, not a prop.** Two is what makes a tile big enough to
// hold a Hebrew material name at body size without truncation, and a `columns`
// prop that nobody passes is a decision pretending to be an option. Width is a
// percentage with space-between rather than a gap, because 48% + 48% + the 4%
// between always fits, while two 48% tiles plus an absolute gap overflow on a
// 320pt screen and drop to one per row.
//
// **The add tile is part of the API and not a caller's afterthought.** The
// sketch puts "add a new one" at the bottom of the grid, and the grid it sits
// under is one that fills up over time from the farm's own history -- so on the
// first run the only thing on screen is that tile. `actions` renders after the
// values in the same grid, drawn as an outline so a farmer can see at a glance
// which squares are things he did before and which one opens a keyboard.
//
// **An empty grid says so.** `emptyHint` is what stops "no options plus one add
// button" from reading as a broken screen; it is the sentence that explains
// the grid will fill.
//
// Selection uses the same Field-700 on Field-100 that formStyles.chipActive
// has always used, so a tile and a chip read as the same control in different
// sizes rather than as two systems. Colour and visual weight are deliberately
// left where they are -- the founder asked for structure and interaction here,
// and said polish comes later.
//
// ---- Adopting it on another screen ----
//
//   <TilePicker
//     title={t('some.question')}
//     subtitle={`${index} ${t('spray.stepOf')} ${total}`}   // optional
//     options={values.map((v) => ({ value: v, label: v }))}
//     selectedValue={current}
//     onSelect={setCurrent}
//     actions={[{ key: 'add', label: t('some.add'), onPress: openInput }]}
//     emptyHint={t('some.empty')}
//     disabled={busy}
//     footer={adding ? <TheTextInput /> : null}
//   />
//
// `value` is the identity that comes back to onSelect and it is a string, so a
// row keyed by an id passes the id and shows the name (see the plot step in
// SprayEntrySheet). `caption` is a second, smaller line under the label, used
// on the review screen to say which field a value belongs to.

export type TileOption = {
  value: string;
  label: string;
  caption?: string;
};

export type TileAction = {
  key: string;
  label: string;
  onPress: () => void;
};

export function TilePicker({
  title,
  subtitle,
  options,
  selectedValue,
  onSelect,
  actions,
  emptyHint,
  disabled,
  footer,
}: {
  title: string;
  subtitle?: string;
  options: readonly TileOption[];
  // null when nothing is picked yet. Every step of a fresh spray starts here.
  selectedValue: string | null;
  onSelect: (value: string) => void;
  actions?: readonly TileAction[];
  emptyHint?: string;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const busy = disabled === true;
  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {options.length === 0 && emptyHint ? <Text style={styles.empty}>{emptyHint}</Text> : null}

      <View style={styles.grid}>
        {options.map((option) => {
          const active = option.value === selectedValue;
          return (
            <Pressable
              key={option.value}
              style={[styles.tile, active && styles.tileActive, busy && styles.tileDisabled]}
              onPress={() => onSelect(option.value)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: busy }}
            >
              <Text style={[styles.tileText, active && styles.tileTextActive]} numberOfLines={2}>
                {option.label}
              </Text>
              {option.caption ? (
                <Text style={styles.tileCaption} numberOfLines={1}>
                  {option.caption}
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        {(actions ?? []).map((action) => (
          <Pressable
            key={action.key}
            style={[styles.tile, styles.tileAction, busy && styles.tileDisabled]}
            onPress={action.onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={[styles.tileText, styles.tileActionText]} numberOfLines={2}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.s12,
  },
  heading: {
    gap: spacing.s4,
  },
  // The question, not a field label. One per screen, so it carries the weight a
  // screen title carries elsewhere rather than the weight of formStyles.label.
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.ink900,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  empty: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  // space-between with a row gap and no column gap: see the header. Two tiles
  // of 48% and the 4% between them fit at every screen width this app runs at.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.s12,
  },
  tile: {
    width: '48%',
    minHeight: touchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s12,
    // Two points always, so selecting a tile changes colour and never the
    // layout. A border that grows on selection nudges every tile after it.
    borderWidth: 2,
    borderColor: colors.border200,
    borderRadius: radius.card,
    backgroundColor: colors.paper,
  },
  tileActive: {
    borderColor: colors.field700,
    backgroundColor: colors.field100,
  },
  tileDisabled: {
    opacity: 0.6,
  },
  // Dashed, so "add a new one" is visibly a different kind of square from the
  // ones holding values he has used before.
  tileAction: {
    borderStyle: 'dashed',
    backgroundColor: colors.mist100,
  },
  tileText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  tileTextActive: {
    color: colors.field700,
  },
  tileActionText: {
    color: colors.field700,
  },
  tileCaption: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
});
