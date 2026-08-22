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
  // design.md, Border Radius: גיליון תחתון 28 בפינות העליונות בלבד.
  sheet: 28,
  pill: 999,
} as const;

// design.md, Elevation: המערכת היא hairline first, צל שמור אך ורק
// לאלמנטים מרחפים, כפתור הרישום וגיליונות תחתונים.
// המקור: --shadow-float: 0 10px 28px rgba(22, 35, 28, 0.18)
export const shadowFloat = {
  shadowColor: '#16231c',
  shadowOffset: { width: 0, height: 10 },
  shadowRadius: 28,
  shadowOpacity: 0.18,
  elevation: 12,
} as const;

// design.md, Touch Targets: 56 מינימום לכל אלמנט לחיץ, 88 לכפתור הראשי.
export const touchTarget = {
  min: 56,
  primary: 88,
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
