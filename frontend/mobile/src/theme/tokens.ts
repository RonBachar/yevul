// טוקני עיצוב ללקוח הנייד, נגזרים מ-docs/design.md. ב-RN אין CSS
// variables, אז זה אובייקט טהור. שמות משפחות הפונט תואמים למה שנטען
// ב-App.tsx דרך useFonts. הצבעים עצמם מגיעים ממקור אמת יחיד ב-
// packages/shared, כדי שלא יהיה עותק ידני נפרד שיכול להתפצל מהווב.

export { colors } from '@yevul/shared';

// ב-RN כל משקל הוא משפחה רשומה בנפרד. הנייד טוען כרגע שלושה משקלים.
export const fonts = {
  regular: 'OedooPro-Regular',
  medium: 'OedooPro-Medium',
  bold: 'OedooPro-Bold',
} as const;

export const spacing = {
  s4: 4,
  s8: 8,
  s12: 12,
  s16: 16,
  s24: 24,
  s32: 32,
  s48: 48,
} as const;

export const radius = {
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  micro: 13,
  caption: 15,
  bodySm: 17,
  body: 19,
  bodyLg: 22,
  subheading: 26,
  headingSm: 34,
  heading: 44,
} as const;
