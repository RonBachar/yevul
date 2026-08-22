// טוקני העיצוב ללקוח הנייד. **אין כאן ערכים משלנו.** הכל נגזר ממקור
// אמת יחיד ב-packages/shared, שנגזר בתורו מ-docs/design.md. הקובץ הזה
// רק מתרגם לצורה ש-React Native צורך, כי ב-RN אין CSS variables ואין
// יחידות, וכל משקל פונט הוא משפחה רשומה בנפרד.
//
// עד ביקורת הארכיטקטורה של שלב 2 הערכים ישבו כאן וגם ב-tokens.css של
// הווב, שני עותקים ידניים שכבר הספיקו להיפרד.

import { shadowFloat as sharedShadow } from '@yevul/shared';

export { colors, spacing, radius, fontSize, touchTarget } from '@yevul/shared';

// ב-RN כל משקל הוא משפחה רשומה בנפרד, ולכן המשקלים מ-shared הופכים
// כאן לשמות המשפחות שנטענות ב-App.tsx. הנייד טוען שלושה משקלים.
export const fonts = {
  regular: 'OedooPro-Regular',
  medium: 'OedooPro-Medium',
  bold: 'OedooPro-Bold',
} as const;

// RN מפרק צל לשדות נפרדים ולא למחרוזת אחת כמו CSS.
export const shadowFloat = {
  shadowColor: '#16231c',
  shadowOffset: { width: 0, height: sharedShadow.offsetY },
  shadowRadius: sharedShadow.blur,
  shadowOpacity: 0.18,
  elevation: 12,
} as const;
