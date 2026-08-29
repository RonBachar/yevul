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
// כאן לשמות המשפחות שנטענות ב-App.tsx. הנייד טוען ארבעה משקלים.
//
// black (900) נוסף בשלב 4 בשביל מספרי הרווח, שהם המקום היחיד במפרט
// שדורש את המשקל הזה (display ו-heading-lg).
export const fonts = {
  regular: 'OedooPro-Regular',
  medium: 'OedooPro-Medium',
  bold: 'OedooPro-Bold',
  black: 'OedooPro-Black',
} as const;

// RN מפרק צל לשדות נפרדים ולא למחרוזת אחת כמו CSS.
export const shadowFloat = {
  shadowColor: sharedShadow.colorHex,
  shadowOffset: { width: 0, height: sharedShadow.offsetY },
  shadowRadius: sharedShadow.blur,
  shadowOpacity: sharedShadow.opacity,
  elevation: 12,
} as const;
