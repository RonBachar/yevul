import { LOG_ENTRY_TYPES, type LogEntryType } from './logEntries';
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

function normalizePlotName(value: string): string {
  return value
    .replace(/["'׳״]/g, '')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== '' && word !== 'חלקה' && word !== 'החלקה')
    .map((word) => (word.startsWith('ה') && word.length >= 3 ? word.slice(1) : word))
    .join(' ')
    .toLowerCase();
}

export function resolvePlotName(
  spoken: string | null,
  plots: { id: string; name: string }[],
): PlotMatch {
  if (spoken === null) return { status: 'none' };

  const target = normalizePlotName(spoken);
  if (target === '') return { status: 'none' };

  const matches = plots.filter((plot) => normalizePlotName(plot.name) === target);
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
