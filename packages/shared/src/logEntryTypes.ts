// סוגי רשומת היומן, מודול טהור בלי שום ייבוא.
//
// **הופרד מ-logEntries.ts כדי שה-Worker יוכל לייבא את voice.ts.**
// voice.ts זקוק ל-LOG_ENTRY_TYPES בשביל ה-enum בסכמת היומן וגם בשביל
// הוולידטור, ו-LOG_ENTRY_TYPES הוא **ערך ריצה ולא טיפוס**, כלומר הוא
// לא נמחק בקומפילציה. כל עוד הוא ישב ב-logEntries.ts, ייבוא שלו גרר
// גם את שתי השורות הראשונות של אותו קובץ, react ו-supabase-js, לתוך
// באנדל של Cloudflare Worker שאין לו שום צורך בשניהם.
//
// אף קובץ ב-Worker לא ייבא עד היום את @yevul/shared, ולכן זה מעולם לא
// התפוצץ. הוא היה מתפוצץ בייבוא הראשון בדיוק.
//
// הסדר כאן הוא סדר התצוגה בשורת הצ'יפים של הגיליון, prd.md סעיף 8:
// "חריש, זריעה, דישון, ריסוס, השקיה, גיזום, דילול, קטיף, תיקון ואחר".

export type LogEntryType =
  | 'till'
  | 'sow'
  | 'fertilize'
  | 'spray'
  | 'irrigate'
  | 'prune'
  | 'thin'
  | 'harvest'
  | 'repair'
  | 'other';

export const LOG_ENTRY_TYPES: readonly LogEntryType[] = [
  'till',
  'sow',
  'fertilize',
  'spray',
  'irrigate',
  'prune',
  'thin',
  'harvest',
  'repair',
  'other',
];
