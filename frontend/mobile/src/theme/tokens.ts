// טוקני העיצוב ללקוח הנייד. **אין כאן ערכים משלנו.** הכל נגזר ממקור
// אמת יחיד ב-packages/shared, שנגזר בתורו מ-docs/design.md. הקובץ הזה
// רק מתרגם לצורה ש-React Native צורך, כי ב-RN אין CSS variables ואין
// יחידות, וכל משקל פונט הוא משפחה רשומה בנפרד.
//
// עד ביקורת הארכיטקטורה של שלב 2 הערכים ישבו כאן וגם ב-tokens.css של
// הווב, שני עותקים ידניים שכבר הספיקו להיפרד.

import { colors, shadowFloat as sharedShadow, type ProfitTone } from '@yevul/shared';

export { colors, spacing, radius, fontSize, touchTarget } from '@yevul/shared';

// ב-RN כל משקל הוא משפחה רשומה בנפרד, ולכן המשקלים מ-shared הופכים
// כאן לשמות המשפחות שנטענות ב-App.tsx.
//
// **שתי משפחות בלבד, כי ל-Alef יש בדיוק שני משקלים.** המשפחה הוחלפה
// מ-OedooPro ל-Alef בהחלטת היזם 2026-08-31. medium ו-black שהיו כאן
// קודם נמחקו, וכל הקוראים שלהם מופו ל-bold: אלה היו תוויות, מצבים
// פעילים ומספרי רווח, וכולם רוצים הדגשה. ההיררכיה שהמשקל נשא עוברת
// לגודל ולצבע.
export const fonts = {
  regular: 'Alef-Regular',
  bold: 'Alef-Bold',
} as const;

// RN מפרק צל לשדות נפרדים ולא למחרוזת אחת כמו CSS.
export const shadowFloat = {
  shadowColor: sharedShadow.colorHex,
  shadowOffset: { width: 0, height: sharedShadow.offsetY },
  shadowRadius: sharedShadow.blur,
  shadowOpacity: sharedShadow.opacity,
  elevation: 12,
} as const;

// צבע מספר רווח לפי הטון. שלושה מסכים בנייד הציגו את אותה שרשרת
// שלישייה מילה במילה (כרטיס הבית, כרטיס החלקה, וכותרת פרטי החלקה),
// וזה בדיוק סוג הכפילות שגורמת לצבע להתפצל כשמישהו משנה אחד מהם.
// אפס הוא Ink-900 ולא ירוק ולא אדום, design.md: הוא אינו רווח ואינו
// הפסד, ולצבוע אותו הוא אות שקרי.
export function profitToneColor(tone: ProfitTone): string {
  if (tone === 'profit') return colors.profit600;
  if (tone === 'loss') return colors.loss600;
  return colors.ink900;
}
