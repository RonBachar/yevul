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

export type FarmSettings = {
  farm_id: string;
  currency: Currency;
  area_unit: AreaUnit;
  locale: Locale;
};

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
