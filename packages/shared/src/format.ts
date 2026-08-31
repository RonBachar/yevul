import { t } from './i18n';
import { areaUnitLabelKey, type AreaUnit, type Currency } from './settings';

// פורמטר יחיד לשטח ולסכום, אחת משבע ההחלטות שאסור להתפשר עליהן
// ב-docs/prd.md, סעיף א.4. גם בהשקה בעברית בלבד, כדי שהרחבה בינלאומית
// עתידית תהיה עבודה של שבועות ולא של חודשים. מסך פרטי החלקה הוא
// המסך הראשון שמציג שטח וסכום אמיתיים, ולכן הפורמטר נולד כאן.
//
// הלוקאל קבוע כרגע כי settings.ts מגביל את השדה לעברית בלבד עד שלב 8.
// כשמתווספת שפה שנייה, הלוקאל עובר לפרמטר שנגזר מ-Settings.locale,
// לא נכתב מחדש.
const NUMBER_LOCALE = 'he-IL';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 2 }).format(value);
}

// שם החודש בלבד, לנודניק ההתיישנות של צפי הרווח ("לא עודכן מאז
// אפריל"). design.md בוחר בשם חודש ולא בתאריך מלא או במניין ימים, כי
// המסר הוא "מזמן", לא מדידה מדויקת. שמות החודשים נגזרים מהפלטפורמה
// ולא ממפה ידנית של שנים עשר שמות, מאותו נימוק כמו currencySymbol.
//
// toLocaleDateString ולא Intl.DateTimeFormat: זו הצורה שכבר מוכחת
// בפועל על מכשיר בקוד הזה (ראה LogEntrySheet). Hermes אינו מיישם את
// כל משטח Intl (Intl.RelativeTimeFormat, למשל, חסר בו לגמרי), ולכן
// אין סיבה להסתמך כאן על ענף שלא נוסה על מכשיר.
export function formatMonthName(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  return value.toLocaleDateString(NUMBER_LOCALE, { month: 'long' });
}

export function formatArea(value: number, unit: AreaUnit): string {
  return `${formatNumber(value)} ${t(areaUnitLabelKey(unit))}`;
}

export function formatAmount(value: number, currency: Currency): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// כרטיס ההכנסה הצפויה מציג ספרה בודדת ב-heading-lg (60px), ואין תקרה
// לגודל הסכום עצמו (דונמים × יבול × מחיר). מ-7 ספרות ומעלה הטקסט חצה
// את גבול הכרטיס. הפונקציה מכווצת את הגופן לפי אורך המחרוזת המפורמטת
// במקום להוסיף גלישת שורה, כדי שהמספר יישאר קריא בשורה אחת מרחק זרוע.
export function scaledAmountFontSize(formatted: string, base: number, min: number): number {
  const fitLength = 9;
  const excess = Math.max(0, formatted.length - fitLength);
  return Math.max(min, base - excess * 4);
}

// design.md, Accessibility: "Pair every profit/loss color with an explicit
// +/− sign and a directional glyph. Color reinforces; it never carries
// meaning alone." הסימן הוא חלק מהפורמט ולא קישוט, ולכן הוא חי כאן ולא
// במסך.
//
// **מקף ASCII (U+002D) ולא מינוס טיפוגרפי (U+2212).** הגרסה הקודמת
// בחרה ב-U+2212 כדי שייקרא כסימן חשבוני, וזה היה נכון ל-OedooPro.
// **ל-Alef, שהחליפה אותה, פשוט אין את הגליף הזה** (אומת מול טבלת
// ה-cmap של הקובץ), ולכן כל מספר שלילי במוצר היה מרונדר עם מינוס
// שנלקח מפונט מערכת אחר, כלומר תו זר בתוך מספר כספי. סימן שנראה נכון
// ובאותו פונט עדיף על סימן נכון טיפוגרפית שנשבר בפועל.
export function formatSignedAmount(value: number, currency: Currency): string {
  const formatted = formatAmount(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

// אפס אינו רווח ואינו הפסד. design.md: לצבוע אותו ירוק או אדום הוא
// אות שקרי בפעם הראשונה שחקלאי פותח את האפליקציה.
export type ProfitTone = 'profit' | 'loss' | 'zero';

export function profitTone(value: number): ProfitTone {
  if (value > 0) return 'profit';
  if (value < 0) return 'loss';
  return 'zero';
}

// סימן המטבע לבדו, בלי מספר. נגזר מ-Intl ולא ממפה ידנית, כדי שהוספת
// מטבע ב-settings.ts לא תדרוש לזכור טבלה שנייה כאן.
export function currencySymbol(currency: Currency): string {
  const parts = new Intl.NumberFormat(NUMBER_LOCALE, { style: 'currency', currency }).formatToParts(
    0,
  );
  return parts.find((part) => part.type === 'currency')?.value ?? '';
}

// ============================================================
// תוויות היחידה בשדות עדכון הצפי.
//
// שתי התוויות הישנות, "יבול צפוי ליחידת שטח" ו"מחיר משוער ליחידה",
// השתמשו במילה "יחידה" בשתי משמעויות שונות באותו גיליון: בראשונה היא
// יחידת השטח (דונם) ובשנייה יחידת היבול (ק"ג). הפונקציות כאן מרכיבות
// את היחידות האמיתיות מהנתונים, "ק״ג לדונם" ו-"₪ לק״ג", כדי שהמילה
// המופשטת לא תופיע בממשק בכלל.
// ============================================================

// **אין כאן יחידת ברירת מחדל.** גרסה קודמת השלימה את המילה "יחידה"
// כשהשדה היה ריק, והציגה "300 יחידה לדונם" למי שלא הזין כלום. זה טוען
// יחידה שלא קיימת בנתונים, וגרוע מכך, לא ניתן להבדיל בינה לבין חקלאי
// שבאמת מודד ביחידות. כשאין יחידה, התווית פשוט מוותרת עליה.
function trimmedUnit(yieldUnit: string | null): string | null {
  const trimmed = yieldUnit?.trim();
  return trimmed ? trimmed : null;
}

// "ק״ג לדונם", "יחידות לדונם", ובלי יחידה פשוט "לדונם".
//
// ל׳ בטוחה כאן: יחידת היבול היא המונה, ואחרי ל׳ באה יחידת השטח, שהיא
// מרשימה סגורה שאנחנו שולטים בה ותמיד ביחיד (דונם, הקטאר, אקר). לכן
// כל צורה שהחקלאי יקליד עובדת, יחיד או רבים.
export function yieldRateUnitLabel(yieldUnit: string | null, areaUnit: AreaUnit): string {
  const perArea = `${t('plots.forecast.per')}${t(areaUnitLabelKey(areaUnit))}`;
  const unit = trimmedUnit(yieldUnit);
  return unit ? `${unit} ${perArea}` : perArea;
}

// "₪ / ק״ג", "₪ / יחידות", ובלי יחידה פשוט "₪".
//
// **לוכסן ולא ל׳, וזו לא קוסמטיקה.** כאן יחידת היבול היא המכנה, ואחרי
// ל׳ היא חייבת להיות ביחיד. עידו העיר שגידולים נספרים ביחידות ולא רק
// נשקלים, ובדיוק שם ל׳ נשברת: "₪ ליחידות", "₪ לארגזים", "₪ לשקים".
// הלוכסן הוא הסימון המקובל ממילא על לוח מחירים חקלאי ("₪/ק״ג"), והוא
// חסין לצורת היחידה שהוקלדה. אין ניסיון להטות מרבים ליחיד, השדה הוא
// טקסט חופשי ונרמול כזה היה נשבר על הערך הראשון שלא חשבנו עליו.
export function priceUnitLabel(yieldUnit: string | null, currency: Currency): string {
  const symbol = currencySymbol(currency);
  const unit = trimmedUnit(yieldUnit);
  return unit ? `${symbol} / ${unit}` : symbol;
}
