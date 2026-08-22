// טוקני העיצוב הלא צבעוניים, מקור אמת יחיד, נגזרים מ-docs/design.md.
//
// הצבעים כבר ישבו כאן ב-colors.ts מאותה סיבה בדיוק. מרווחים, רדיוסים
// וטיפוגרפיה נשארו מאחור ותוחזקו ידנית פעמיים, וזה כבר יצר פער בפועל:
// לנייד היה רדיוס 28 לגיליון תחתון ולווב לא הייתה מקבילה, ולשניהם חסר
// רדיוס 20 של כרטיס שקיים במפרט. נמצא בביקורת הארכיטקטורה של שלב 2.
//
// ערכים גולמיים במספרים, בלי יחידות. הנייד צורך אותם כמו שהם כי ב-RN
// אין יחידות, והווב הופך אותם למשתני CSS עם px ב-applyDesignTokens.

// design.md, Spacing Scale. יחידת בסיס 4.
export const spacing = {
  s4: 4,
  s8: 8,
  s12: 12,
  s16: 16,
  s20: 20,
  s24: 24,
  s32: 32,
  s40: 40,
  s48: 48,
  s64: 64,
  s80: 80,
} as const;

// design.md, Border Radius.
export const radius = {
  input: 16,
  card: 20,
  sheet: 28,
  pill: 9999,
} as const;

// design.md, Type Scale. הרצפה היא 15, שום דבר במוצר לא יורד מתחתיה.
export const fontSize = {
  micro: 13,
  caption: 15,
  bodySm: 17,
  body: 19,
  bodyLg: 22,
  subheading: 26,
  headingSm: 34,
  heading: 44,
  headingLg: 60,
  display: 84,
} as const;

// design.md, Typography. המשקלים שבשימוש בפועל מתוך שמונת המשקלים
// של המשפחה. הנייד ממפה אותם לשמות משפחה, כי ב-RN כל משקל הוא
// משפחה רשומה בנפרד, והווב משתמש במספר ישירות.
export const fontWeight = {
  book: 400,
  medium: 600,
  bold: 700,
  black: 900,
} as const;

// design.md, Touch Targets. 56 מינימום לכל אלמנט לחיץ, 88 למיקרופון
// ולכפתור הרישום. זו החלטת נגישות מכוונת לקהל שעובד בחוץ, לא ברירת
// המחדל של הפלטפורמה.
export const touchTarget = {
  min: 56,
  primary: 88,
} as const;

// design.md, Elevation. המערכת היא hairline first, הצל שמור אך ורק
// לאלמנטים מרחפים, כפתור הרישום וגיליונות תחתונים.
export const shadowFloat = {
  offsetY: 10,
  blur: 28,
  color: 'rgba(22, 35, 28, 0.18)',
} as const;
