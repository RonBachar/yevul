// טוקני עיצוב ללקוח הנייד, נגזרים מ-docs/design.md, אותם ערכים כמו
// טוקני הווב. ב-RN אין CSS variables, אז זה אובייקט טהור. שמות משפחות
// הפונט תואמים למה שנטען ב-app/_layout.tsx דרך useFonts.

export const colors = {
  field700: '#1d6b45',
  field500: '#2fa06a',
  field300: '#8fd6ae',
  field100: '#e1f4e9',
  profit600: '#26804c',
  loss600: '#c1502e',
  loss100: '#fbe7df',
  wheat800: '#8a5a12',
  wheat500: '#e3a233',
  wheat100: '#fbeed2',
  sky500: '#3e8fd0',
  ink900: '#16231c',
  slate600: '#56655d',
  mist200: '#e7efe9',
  mist100: '#f3f7f4',
  border200: '#d6e0d9',
  paper: '#ffffff',
} as const;

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
