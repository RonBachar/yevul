// **מ-logEntryTypes ולא מ-logEntries, וזה לא סגנון.** הקובץ הזה נטען
// גם ב-Cloudflare Worker, ו-logEntries.ts מייבא react ו-supabase-js
// בשתי שורותיו הראשונות. LOG_ENTRY_TYPES הוא ערך ריצה ולא טיפוס,
// כלומר הוא לא נמחק בקומפילציה והיה גורר את שניהם לבאנדל של השרת.
import { LOG_ENTRY_TYPES, type LogEntryType } from './logEntryTypes';
import { isCalendarDate } from './safeHarvestDate';

// שלוש סכמות החילוץ מקול, שלב 5, prd.md נספח א.5.
//
// "זרימה אחת, שלוש סכמות. ההקלטה נשלחת ל-Worker, שבודק מכסה ומסלול,
// מריץ תמלול עברית, ואז מריץ LLM שמחזיר JSON מובנה שממלא את הטופס
// הרלוונטי. התוצאה תמיד עוברת מסך אישור לפני שהיא נכנסת."
//
// הקובץ הזה מגדיר את **החוזה** בין ה-LLM לאפליקציה, בשלושה חלקים:
// הטיפוס, סכמת ה-JSON שנשלחת למודל, והוולידטור שבודק את מה שחזר.
// אין כאן קריאות רשת ואין הוקים, הכל טהור ובדיק.
//
// **פלט LLM אינו מקור אמין.** מודל יכול להחזיר שדה חסר, מספר
// כמחרוזת, תאריך מומצא או ערך מחוץ לרשימה סגורה, וכל אלה יגיעו
// כ-JSON תקין תחבירית. הוולידטורים כאן מתייחסים לקלט כעוין, ולכן
// הם בודקים טיפוס וטווח ולא רק נוכחות.
//
// **אין כאן ספריית ולידציה בכוונה.** packages/shared הוא אפס תלויות
// ורץ זהה בנייד, בווב וב-Worker, וממילא נדרשת גם סכמת JSON למודל,
// כך שספרייה הייתה גוררת גם ממיר לסכמה.
//
// **שדה "קטגוריה" מה-PRD מחולץ כאן כ"שם".** prd.md נספח א.5 מונה
// "סכום, קטגוריה, חלקה, תאריך", אבל אין קטגוריות במוצר: בורר
// הקטגוריות נדחה בשלב 3 בבקשת עידו, ועמודת category מחזיקה את שם
// ההוצאה כטקסט חופשי. חילוץ "קטגוריה" היה ממלא שדה שאינו קיים,
// ולכן הקול והטופס הידני ממלאים בדיוק את אותו שדה.

export type VoiceKind = 'expense' | 'task' | 'journal';

export const VOICE_KINDS: readonly VoiceKind[] = ['expense', 'task', 'journal'];

// **plotName ולא plotId.** ה-LLM שומע "החלקה הדרומית" ואין לו שום
// דרך לדעת מזהים. ההמרה למזהה היא צעד נפרד ומכוון, ראה resolvePlotName.
export type VoiceExpense = {
  amount: number;
  name: string | null;
  plotName: string | null;
  date: string;
  confidence: number;
  // prd.md סעיף 8: "הקלטה אחת, הוצאה אחת". הדגל דלוק כשה-LLM שמע יותר
  // מפריט אחד, ואז מסך האישור מוסיף "שמענו כמה הוצאות, בוא נעשה אחת
  // בכל פעם". **אין סכמה של רשימת הוצאות, וזו החלטת היקף מכוונת.**
  hasMoreItems: boolean;
};

export type VoiceTask = {
  title: string;
  plotName: string | null;
  dueDate: string | null;
  estimatedCost: number | null;
  confidence: number;
};

export type VoiceJournal = {
  date: string;
  plotName: string | null;
  type: LogEntryType;
  note: string | null;
  sprayPest: string | null;
  sprayMaterial: string | null;
  sprayDose: string | null;
  sprayPhiDays: number | null;
  confidence: number;
};

export type VoiceParsed =
  | { kind: 'expense'; value: VoiceExpense }
  | { kind: 'task'; value: VoiceTask }
  | { kind: 'journal'; value: VoiceJournal };

// reason אינו נחשף למשתמש, הוא ללוג ולבדיקות. החקלאי רואה "לא הבנו,
// נסה שוב" ומקליט מחדש, כי אין שום ערך בלהסביר לו איזה שדה חסר.
export type VoiceParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

// ============================================================
// עזרי ולידציה. כל אחד מהם מקבל unknown ומחזיר ערך מטוהר או null,
// כדי שהוולידטורים למטה יקראו כרשימת בדיקות ולא כקן של typeof.
// ============================================================

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

// **מחרוזת ריקה או רווחים הופכת ל-null ולא נשמרת כמות שהיא.** מודל
// שלא מצא ערך מחזיר לעיתים "" במקום null, ובלי הניקוי הזה היינו
// שומרים הערה ריקה או שם הוצאה ריק במסד.
function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// מספרים בלבד, ולא מחרוזת שנראית כמספר. מודל שמחזיר "1500" במקום
// 1500 הוא מודל שלא כיבד את הסכמה, ועדיף לדחות ולבקש הקלטה חוזרת
// מלהתחיל לנחש המרות על נתון כספי.
function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

// null נכנס, null יוצא, כלומר "המודל חיפש ולא מצא". ערך פסול מחזיר
// **undefined ולא null**, כלומר "הקלט שגוי, דחה את הרשומה".
//
// **הגרסה הראשונה החזירה כאן את finitePositive ישירות, וזה היה באג.**
// finitePositive מחזיר null על ערך פסול, ולכן עלות שהגיעה כמחרוזת
// ("420") הייתה נמחקת בשקט במקום להידחות, והרשומה נשמרת בלי עלות
// בלי שאיש ידע. באותו מסלול בדיוק גם sprayPhiDays, שהוא השדה שממנו
// נגזר "בטוח לקטיף", כלומר החישוב הרגולטורי הקריטי במוצר. נתפס
// בטסט שנכתב יחד עם הקוד.
function optionalFinitePositive(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  const parsed = finitePositive(value);
  return parsed === null ? undefined : parsed;
}

// ודאות מחוץ ל-0..1 מקוצצת ולא דוחה את כל הרשומה. היא משפיעה על
// הדגשה במסך האישור בלבד, והחקלאי מאשר כל רשומה ממילא, ולכן היא
// לעולם אינה סיבה לזרוק חילוץ תקין.
function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function optionalCalendarDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  return isCalendarDate(value) ? value : undefined;
}

// ============================================================
// הוולידטורים.
// ============================================================

export function parseVoiceExpense(raw: unknown): VoiceParseResult<VoiceExpense> {
  const data = asRecord(raw);
  if (!data) return { ok: false, reason: 'not an object' };

  const amount = finitePositive(data.amount);
  if (amount === null) return { ok: false, reason: 'amount must be a positive number' };

  if (typeof data.date !== 'string' || !isCalendarDate(data.date)) {
    return { ok: false, reason: 'date must be YYYY-MM-DD' };
  }

  return {
    ok: true,
    value: {
      amount,
      name: optionalText(data.name),
      plotName: optionalText(data.plotName),
      date: data.date,
      confidence: clampConfidence(data.confidence),
      hasMoreItems: data.hasMoreItems === true,
    },
  };
}

export function parseVoiceTask(raw: unknown): VoiceParseResult<VoiceTask> {
  const data = asRecord(raw);
  if (!data) return { ok: false, reason: 'not an object' };

  const title = optionalText(data.title);
  if (title === null) return { ok: false, reason: 'title is required' };

  const dueDate = optionalCalendarDate(data.dueDate);
  if (dueDate === undefined) return { ok: false, reason: 'dueDate must be YYYY-MM-DD or null' };

  const estimatedCost = optionalFinitePositive(data.estimatedCost);
  if (estimatedCost === undefined) {
    return { ok: false, reason: 'estimatedCost must be a positive number or null' };
  }

  return {
    ok: true,
    value: {
      title,
      plotName: optionalText(data.plotName),
      dueDate,
      estimatedCost,
      confidence: clampConfidence(data.confidence),
    },
  };
}

export function parseVoiceJournal(raw: unknown): VoiceParseResult<VoiceJournal> {
  const data = asRecord(raw);
  if (!data) return { ok: false, reason: 'not an object' };

  if (typeof data.date !== 'string' || !isCalendarDate(data.date)) {
    return { ok: false, reason: 'date must be YYYY-MM-DD' };
  }

  // רשימה סגורה. מודל שהמציא סוג פעולה שאינו קיים היה נכתב למסד
  // ונדחה שם על ידי דומיין log_entry_type, ועדיף להיעצר כאן.
  if (typeof data.type !== 'string' || !LOG_ENTRY_TYPES.includes(data.type as LogEntryType)) {
    return { ok: false, reason: 'type is not a known log entry type' };
  }
  const type = data.type as LogEntryType;

  const sprayPhiDays = optionalFinitePositive(data.sprayPhiDays);
  if (sprayPhiDays === undefined) {
    return { ok: false, reason: 'sprayPhiDays must be a positive number or null' };
  }

  const value: VoiceJournal = {
    date: data.date,
    plotName: optionalText(data.plotName),
    type,
    note: optionalText(data.note),
    sprayPest: optionalText(data.sprayPest),
    sprayMaterial: optionalText(data.sprayMaterial),
    sprayDose: optionalText(data.sprayDose),
    sprayPhiDays,
    confidence: clampConfidence(data.confidence),
  };

  // **שדות הריסוס נמחקים כשהסוג אינו ריסוס.** מודל שמזהה "רססתי
  // וגם קטפתי" עלול לתייג קטיף ועדיין למלא חומר ומזיק, ורשומת קטיף
  // שנושאת ימי המתנה הייתה מזינה חישוב "בטוח לקטיף" שקרי, שהוא
  // החישוב הרגולטורי הקריטי במוצר.
  if (type !== 'spray') {
    value.sprayPest = null;
    value.sprayMaterial = null;
    value.sprayDose = null;
    value.sprayPhiDays = null;
  }

  return { ok: true, value };
}

export function parseVoiceResult(kind: VoiceKind, raw: unknown): VoiceParseResult<VoiceParsed> {
  if (kind === 'expense') {
    const result = parseVoiceExpense(raw);
    return result.ok ? { ok: true, value: { kind, value: result.value } } : result;
  }
  if (kind === 'task') {
    const result = parseVoiceTask(raw);
    return result.ok ? { ok: true, value: { kind, value: result.value } } : result;
  }
  const result = parseVoiceJournal(raw);
  return result.ok ? { ok: true, value: { kind, value: result.value } } : result;
}

// ============================================================
// המרת שם חלקה מדובר למזהה.
//
// **הכלל הוא לא לנחש, וזו דרישה מפורשת ולא זהירות יתר.** prd.md
// סעיף 8: "אין ניחוש איזה סכום שייך לאיזו חלקה, כי זה בדיוק המקום
// שבו טעות תמלול הופכת לנתון כספי שגוי". לכן שתי התאמות אפשריות
// מחזירות ambiguous ולא את הראשונה, והמסך שואל את החקלאי.
//
// הנרמול שמרני במכוון: רווחים, גרשיים, המילה "חלקה" שהיא תיאור ולא
// שם, ו-ה' הידיעה בתחילת מילה. **ה' נחתכת רק ממילה שנשארת באורך 2
// ומעלה**, כדי לא להפוך "הר" ל-"ר". אין כאן ניסיון להתאמה מקורבת
// או להטיות, כי התאמה חלקית שגויה גרועה מלשאול.
// ============================================================

export type PlotMatch =
  { status: 'matched'; plotId: string } | { status: 'ambiguous' } | { status: 'none' };

// Exported so the confirmation sheet can ask the *same* question this file
// asks, rather than a second one that looks like it. It needs to tell "he named
// no plot" apart from "he named one and it matched nothing", and the only
// honest test for the first is the one used here: a spoken string that
// normalises to nothing is not a name. A second implementation of that rule
// would eventually disagree with this one, and the disagreement would show up
// as a sentence about a plot the resolver never considered.
export function normalizePlotName(value: string): string {
  return value
    .replace(/["'׳״]/g, '')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== '' && word !== 'חלקה' && word !== 'החלקה')
    .map((word) => (word.startsWith('ה') && word.length >= 3 ? word.slice(1) : word))
    .join(' ')
    .toLowerCase();
}

// **The plots a spoken name could mean, and the reason this exists separately
// from resolvePlotName.** `ambiguous` is deliberately a verdict without a list,
// which is the right shape for a caller that only wants a plot id. It is the
// wrong shape for the confirmation sheet, which has to *show* the candidates
// and make the farmer pick one, and cannot ask about plots it was never told.
//
// resolvePlotName is defined in terms of this rather than the other way round,
// so there is exactly one normalisation and exactly one equality rule. Two
// filters, each written out, is how the verdict and the list eventually
// disagree.
//
// Generic on the plot, so the caller gets back its own objects with whatever
// else it needs to render them, not a stripped copy.
export function resolvePlotCandidates<T extends { id: string; name: string }>(
  spoken: string | null,
  plots: readonly T[],
): T[] {
  if (spoken === null) return [];

  const target = normalizePlotName(spoken);
  if (target === '') return [];

  return plots.filter((plot) => normalizePlotName(plot.name) === target);
}

export function resolvePlotName(
  spoken: string | null,
  plots: { id: string; name: string }[],
): PlotMatch {
  const matches = resolvePlotCandidates(spoken, plots);
  if (matches.length === 1) return { status: 'matched', plotId: matches[0]!.id };
  if (matches.length > 1) return { status: 'ambiguous' };
  return { status: 'none' };
}

// ============================================================
// סכמות ה-JSON שנשלחות ל-LLM.
//
// **חייבות להישאר מסונכרנות עם הוולידטורים שלמעלה.** הסכמה מבקשת
// מהמודל מבנה, והוולידטור בודק מה שבאמת חזר, ושניהם מתארים את אותו
// חוזה משני צדדיו. הטסטים מאמתים שכל שדה בסכמה קיים בטיפוס.
//
// additionalProperties: false בכולן, כדי שהמודל לא ימציא שדות
// שנחשוב בטעות שהם נתונים. required מונה **את כל** השדות, כולל אלה
// שיכולים להיות null, כי "השמטתי" ו"לא מצאתי" הם מצבים שונים, ורק
// null אומר במפורש שהמודל חיפש ולא מצא.
// ============================================================

const CONFIDENCE_FIELD = {
  type: 'number',
  minimum: 0,
  maximum: 1,
  description: 'עד כמה המודל בטוח בחילוץ, בין 0 ל-1',
} as const;

const PLOT_NAME_FIELD = {
  type: ['string', 'null'],
  description: 'שם החלקה כפי שנאמר, בלי המילה "חלקה". null אם לא נאמרה חלקה',
} as const;

export const VOICE_EXPENSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'name', 'plotName', 'date', 'confidence', 'hasMoreItems'],
  properties: {
    amount: { type: 'number', exclusiveMinimum: 0, description: 'הסכום ששולם, מספר בלבד' },
    name: {
      type: ['string', 'null'],
      description: 'על מה שולם, למשל "דשן" או "סולר". טקסט חופשי קצר, לא קטגוריה מרשימה',
    },
    plotName: PLOT_NAME_FIELD,
    date: { type: 'string', description: 'תאריך ההוצאה בפורמט YYYY-MM-DD' },
    confidence: CONFIDENCE_FIELD,
    hasMoreItems: {
      type: 'boolean',
      description: 'true אם נאמרה יותר מהוצאה אחת בהקלטה. אין להחזיר רשימה, רק את הראשונה',
    },
  },
} as const;

export const VOICE_TASK_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'plotName', 'dueDate', 'estimatedCost', 'confidence'],
  properties: {
    title: { type: 'string', description: 'מה צריך לעשות, משפט קצר' },
    plotName: PLOT_NAME_FIELD,
    dueDate: { type: ['string', 'null'], description: 'תאריך יעד YYYY-MM-DD, או null' },
    estimatedCost: { type: ['number', 'null'], description: 'עלות משוערת, או null' },
    confidence: CONFIDENCE_FIELD,
  },
} as const;

export const VOICE_JOURNAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'date',
    'plotName',
    'type',
    'note',
    'sprayPest',
    'sprayMaterial',
    'sprayDose',
    'sprayPhiDays',
    'confidence',
  ],
  properties: {
    date: { type: 'string', description: 'תאריך הפעולה בפורמט YYYY-MM-DD' },
    plotName: PLOT_NAME_FIELD,
    type: { type: 'string', enum: LOG_ENTRY_TYPES, description: 'סוג הפעולה' },
    note: { type: ['string', 'null'], description: 'הערה חופשית, או null' },
    sprayPest: { type: ['string', 'null'], description: 'נגד איזה מזיק. רק כשהסוג spray' },
    sprayMaterial: { type: ['string', 'null'], description: 'באיזה חומר. רק כשהסוג spray' },
    sprayDose: { type: ['string', 'null'], description: 'מינון, טקסט חופשי. רק כשהסוג spray' },
    sprayPhiDays: {
      type: ['number', 'null'],
      description: 'ימי המתנה עד קטיף בטוח. רק כשהסוג spray',
    },
    confidence: CONFIDENCE_FIELD,
  },
} as const;

export function voiceJsonSchema(kind: VoiceKind): object {
  if (kind === 'expense') return VOICE_EXPENSE_JSON_SCHEMA;
  if (kind === 'task') return VOICE_TASK_JSON_SCHEMA;
  return VOICE_JOURNAL_JSON_SCHEMA;
}

// ============================================================
// גרסת החוט של הסכמות, כלומר מה שבאמת נשלח בגוף הבקשה בתוך
// response_format: { type: 'json_schema', json_schema: { strict: true } }.
//
// הסכמות שלמעלה נשארות החוזה הקנוני והן היחידות שמסונכרנות מול
// הוולידטורים. כאן יושבים שני הבדלים, ושניהם נובעים מהעולם האמיתי
// של הספקים ולא מהחוזה עצמו.
//
// **1. מילות המפתח המספריות יורדות.** minimum, maximum
// ו-exclusiveMinimum אינן נתמכות ב-structured outputs, וספק שמקבל
// אותן דוחה את **כל** הבקשה ב-400. הבקשה נשלחת עם מערך models, ראשי
// וגיבוי, כלומר יש מסלול אמיתי שבו ספק אחר מקבל את הסכמה הזו, ותקלה
// כזו הייתה מתגלה רק ביום שבו הספק הראשי למטה, שהוא היום הכי גרוע.
//
// **המידע לא נעלם, הוא עובר ל-description.** האילוץ הפורמלי הופך
// לבקשה בשפה טבעית שהמודל קורא, ו**האכיפה עצמה נשארת בקוד**:
// clampConfidence ו-finitePositive למעלה אוכפים בדיוק את אותם גבולות
// על מה שבאמת חזר. זו הסיבה שההסרה בטוחה. strict: true אינו תחליף,
// כי מידת האכיפה שלו משתנה בין ספק לספק.
//
// **2. נוסף שדה transcript.** יש קריאה אחת בלבד, אודיו נכנס ו-JSON
// יוצא, ואין מסלול טקסט ביניים שאפשר להציג ממנו. בלי השדה הזה, חילוץ
// שנכשל משאיר את החקלאי מול מסך ריק במקום מול "זה מה ששמענו".
// **הוא אינו נכנס לטיפוסים ואינו נכנס לוולידטורים**, כי הוא נתון
// תצוגה ולא שדה של הרשומה. הוולידטורים קוראים רק את המפתחות שלהם
// ומתעלמים משאר, וה-Worker קורא את transcript מהאובייקט הגולמי לפני
// הוולידציה.
// ============================================================

// exclusiveMaximum אינו מופיע היום באף סכמה, והוא ברשימה כי הוא באותה
// משפחת מילות מפתח נדחות. עריכה עתידית שתוסיף אותו לא תחזיר את ה-400
// בשקט.
const NUMERIC_BOUND_KEYWORDS: readonly string[] = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
];

// התרגום מאילוץ לתיאור. "מספר חיובי" ולא "גדול מ-0", כי זו הצורה
// שחקלאי ומודל קוראים באותו אופן.
function boundsHint(node: Record<string, unknown>): string | null {
  const parts: string[] = [];

  const min = node.minimum;
  const max = node.maximum;
  if (typeof min === 'number' && typeof max === 'number') {
    parts.push(`בין ${min} ל-${max}`);
  } else if (typeof min === 'number') {
    parts.push(`לפחות ${min}`);
  } else if (typeof max === 'number') {
    parts.push(`לכל היותר ${max}`);
  }

  const exclusiveMin = node.exclusiveMinimum;
  if (typeof exclusiveMin === 'number') {
    parts.push(exclusiveMin === 0 ? 'מספר חיובי' : `גדול מ-${exclusiveMin}`);
  }

  const exclusiveMax = node.exclusiveMaximum;
  if (typeof exclusiveMax === 'number') parts.push(`קטן מ-${exclusiveMax}`);

  return parts.length === 0 ? null : parts.join(', ');
}

// מעתיק לעומק ומסיר תוך כדי. **מחזיר עותק חדש ולעולם אינו נוגע בקלט**,
// כי הסכמות המקוריות הן as const ומשותפות בין הקריאות: PLOT_NAME_FIELD
// ו-CONFIDENCE_FIELD הם אותו אובייקט בשלוש הסכמות, ומוטציה אחת הייתה
// מזהמת את כולן.
//
// Exported for receipt.ts, which needs the identical treatment for the identical
// reason: its schema also travels inside response_format with a `models` array
// behind it, so it can also reach a provider that answers 400 to a numeric bound
// keyword. A second copy of this walk would be a second thing to keep correct,
// and the failure it guards against only shows up on the day the primary model
// is down — the worst possible day to discover it.
export function withoutNumericBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutNumericBounds);
  if (typeof node !== 'object' || node === null) return node;

  const source = node as Record<string, unknown>;
  const hint = boundsHint(source);
  const copy: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (NUMERIC_BOUND_KEYWORDS.includes(key)) continue;
    copy[key] = withoutNumericBounds(value);
  }

  if (hint !== null) {
    const existing = typeof copy.description === 'string' ? copy.description : '';
    // תיאור שכבר אומר את זה במילים לא מקבל את זה פעמיים.
    // CONFIDENCE_FIELD כבר כתוב "בין 0 ל-1", וכפילות רק מבלבלת את המודל.
    if (existing === '') copy.description = hint;
    else if (!existing.includes(hint)) copy.description = `${existing}, ${hint}`;
  }

  return copy;
}

// **transcript ראשון ב-properties, וזה מכוון.** ב-structured outputs
// המודל מייצר את השדות לפי סדר הופעתם, ולכן תמלול תחילה פירושו שהחילוץ
// מותנה בטקסט שכבר נכתב, במקום להיכתב במקביל לו.
const TRANSCRIPT_FIELD = {
  type: 'string',
  description: 'התמלול המלא של ההקלטה, מילה במילה, בלי פרשנות ובלי תיקון',
} as const;

type WireSchema = {
  required: readonly string[];
  properties: Record<string, unknown>;
  [key: string]: unknown;
};

export function voiceWireJsonSchema(kind: VoiceKind): object {
  const base = withoutNumericBounds(voiceJsonSchema(kind)) as WireSchema;

  return {
    ...base,
    // transcript ב-required כמו כל שדה אחר. הסכמה הזו נשלחת עם
    // additionalProperties: false, ושדה שאינו required בסכמה סגורה הוא
    // בדיוק המצב שספקי structured outputs דוחים.
    required: ['transcript', ...base.required],
    properties: { transcript: { ...TRANSCRIPT_FIELD }, ...base.properties },
  };
}
