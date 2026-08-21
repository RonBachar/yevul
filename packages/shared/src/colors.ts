// טוקני צבע יחידים למותג, נגזרים מ-docs/design.md, Tokens Colors.
// מקור אמת יחיד, כדי שווב ונייד לא יחזיקו שני עותקים ידניים שעלולים
// להתפצל כשצבע משתנה ב-design.md ורק אחד מהעותקים מתעדכן.
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
