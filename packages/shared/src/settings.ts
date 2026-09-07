// טיפוסי ההגדרות של המשק, משקפים את טבלת public.settings בסכמה.
// חיים כאן כדי ששני הלקוחות וה-Worker יסכימו על אותה צורת נתונים בלי
// לתאם ידנית. קוד טהור, בלי רשת ובלי גישה למסד.
//
// **הרשימות האלה הן אוצר מילים לממשק, לא אכיפה.** הן קובעות מה מוצג
// בתפריט הבחירה, והן לא מונעות מלקוח מקולקל או זדוני לכתוב ערך אחר
// ישירות מול ה-API. האכיפה האמיתית שייכת לאילוץ CHECK במסד. ראה את
// ההערה ב-docs/roadmap.md, משימת מסך ההגדרות.

export const CURRENCIES = ['ILS', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

// prd.md סעיף 2, דונם, הקטאר ואקר הם אותה מערכת, יחידה היא הגדרה ולא קבוע.
export const AREA_UNITS = ['dunam', 'hectare', 'acre'] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

// עברית בלבד בהשקה. שפות נוספות נכנסות בשלב 8, יחד עם מנגנון החלפת
// השפה בשכבת התרגום. אין טעם להציע כאן שפה שאין לה מחרוזות.
export const LOCALES = ['he'] as const;
export type Locale = (typeof LOCALES)[number];

// מפתח התרגום לכל ערך, כדי ששני הלקוחות יציגו את אותה תווית לאותו ערך
// ולא יחזיקו כל אחד מילון משלו.
export function currencyLabelKey(value: Currency): string {
  return `settings.currency.${value}`;
}

export function areaUnitLabelKey(value: AreaUnit): string {
  return `settings.areaUnit.${value}`;
}

export function localeLabelKey(value: Locale): string {
  return `settings.locale.${value}`;
}

// יחידת מדידה של חומר ריסוס. **יושבת כאן ולא ב-sprayEntry.ts, וזה תיקון
// של ייבוא מעגלי אמיתי:** format.ts היה מייבא את התווית מ-sprayEntry,
// sprayEntry מייבא מ-calendar, ו-calendar מייבא בחזרה מ-format. Metro
// התריע על כך על מכשיר ("Require cycle ... can result in uninitialized
// values"). זה דומיין ערכים בדיוק כמו המטבע ויחידת השטח שמעליו, ולכן
// מקומו בקובץ העלה הזה שאינו מייבא דבר, וכל צרכן יכול לקרוא לו בבטחה.
export type SprayUnit = 'liter' | 'kg';

// Mirrors public.spray_unit in the migration. Keep the two lists in sync.
export const SPRAY_UNITS: readonly SprayUnit[] = ['liter', 'kg'];

export function sprayUnitLabelKey(unit: SprayUnit): string {
  return `spray.unit.${unit}`;
}

export function isSprayUnit(value: string | null): value is SprayUnit {
  return value === 'liter' || value === 'kg';
}
