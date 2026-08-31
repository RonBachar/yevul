import { StyleSheet } from 'react-native';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from './tokens';

// סגנונות טופס משותפים, שדה, תווית, קלט, שורת צ'יפים וכפתור שמירה.
// נולדו במסך ההגדרות ועברו לכאן כש-PlotFormScreen נזקק לאותם בדיוק,
// כדי שלא יהיו שני עותקים שיכולים להתפצל, אותו כלל כמו טוקני העיצוב.
export const formStyles = StyleSheet.create({
  field: {
    gap: spacing.s8,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  input: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.s16,
    borderWidth: 1,
    borderColor: colors.border200,
    borderRadius: radius.input,
    backgroundColor: colors.paper,
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.ink900,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s8,
  },
  chip: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border200,
    backgroundColor: colors.paper,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipActive: {
    borderColor: colors.field700,
    backgroundColor: colors.field100,
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
  },
  chipTextActive: {
    fontFamily: fonts.bold,
    color: colors.field700,
  },
  save: {
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.field700,
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.paper,
  },
  good: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.profit600,
    writingDirection: 'rtl',
  },
  bad: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.loss600,
    writingDirection: 'rtl',
  },
});
