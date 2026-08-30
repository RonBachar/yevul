import { describe, expect, it } from 'vitest';
import {
  parseVoiceExpense,
  parseVoiceJournal,
  parseVoiceResult,
  parseVoiceTask,
  resolvePlotName,
  voiceJsonSchema,
  VOICE_EXPENSE_JSON_SCHEMA,
  VOICE_JOURNAL_JSON_SCHEMA,
  VOICE_KINDS,
  VOICE_TASK_JSON_SCHEMA,
} from './voice';

// שלוש סכמות החילוץ מקול, שלב 5, prd.md נספח א.5.
//
// **הבדיקות כאן מתייחסות לפלט המודל כעוין**, ולא כאל JSON ידידותי.
// מודל יכול להחזיר מספר כמחרוזת, תאריך שלא קיים בלוח, ערך מחוץ
// לרשימה סגורה, או שדות שלא ביקשנו, וכל אלה הם JSON תקין תחבירית.

const validExpense = {
  amount: 1500,
  name: 'סולר',
  plotName: 'דרומית',
  date: '2026-08-30',
  confidence: 0.9,
  hasMoreItems: false,
};

describe('parseVoiceExpense', () => {
  it('accepts a well formed extraction', () => {
    const result = parseVoiceExpense(validExpense);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount).toBe(1500);
      expect(result.value.name).toBe('סולר');
    }
  });

  // הבדיקה החשובה ביותר בקובץ. סכום הוא נתון כספי, ומודל שהחזיר
  // מחרוזת לא כיבד את הסכמה. עדיף לבקש הקלטה חוזרת מלנחש המרה.
  it('rejects an amount that arrived as a string', () => {
    const result = parseVoiceExpense({ ...validExpense, amount: '1500' });
    expect(result.ok).toBe(false);
  });

  it('rejects a zero or negative amount', () => {
    expect(parseVoiceExpense({ ...validExpense, amount: 0 }).ok).toBe(false);
    expect(parseVoiceExpense({ ...validExpense, amount: -20 }).ok).toBe(false);
  });

  it('rejects NaN and Infinity, which survive a typeof number check', () => {
    expect(parseVoiceExpense({ ...validExpense, amount: NaN }).ok).toBe(false);
    expect(parseVoiceExpense({ ...validExpense, amount: Infinity }).ok).toBe(false);
  });

  // 31 בפברואר הוא תאריך שמודל ממציא בקלות, והוא עובר בדיקת פורמט
  // תמימה. isCalendarDate דוחה גם גלישה ולא רק צורה שגויה.
  it('rejects a date that looks valid but does not exist', () => {
    expect(parseVoiceExpense({ ...validExpense, date: '2026-02-31' }).ok).toBe(false);
    expect(parseVoiceExpense({ ...validExpense, date: '30/08/2026' }).ok).toBe(false);
  });

  it('rejects anything that is not an object', () => {
    expect(parseVoiceExpense(null).ok).toBe(false);
    expect(parseVoiceExpense('טקסט').ok).toBe(false);
    expect(parseVoiceExpense([validExpense]).ok).toBe(false);
  });

  // מודל שלא מצא ערך מחזיר לעיתים מחרוזת ריקה במקום null, ובלעדי
  // הניקוי היינו שומרים שם הוצאה ריק במסד.
  it('turns an empty or whitespace string into null', () => {
    const result = parseVoiceExpense({ ...validExpense, name: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBeNull();
  });

  it('trims surrounding whitespace from text fields', () => {
    const result = parseVoiceExpense({ ...validExpense, name: '  דשן  ' });
    if (result.ok) expect(result.value.name).toBe('דשן');
  });

  // prd.md סעיף 8, "הקלטה אחת, הוצאה אחת". הדגל מפעיל את ההודעה
  // במסך האישור, ולכן חייב להיות בוליאני אמיתי ולא ערך אמיתי-למחצה.
  it('treats hasMoreItems as true only for a real boolean true', () => {
    expect(parseVoiceExpense({ ...validExpense, hasMoreItems: true })).toMatchObject({
      value: { hasMoreItems: true },
    });
    for (const truthy of ['true', 1, 'yes']) {
      const result = parseVoiceExpense({ ...validExpense, hasMoreItems: truthy });
      if (result.ok) expect(result.value.hasMoreItems).toBe(false);
    }
  });

  // הוודאות משפיעה על הדגשה בלבד, והחקלאי מאשר כל רשומה ממילא,
  // ולכן ערך מוזר מקוצץ ואינו זורק חילוץ תקין.
  it('clamps confidence instead of rejecting the extraction', () => {
    const high = parseVoiceExpense({ ...validExpense, confidence: 5 });
    const low = parseVoiceExpense({ ...validExpense, confidence: -2 });
    const missing = parseVoiceExpense({ ...validExpense, confidence: 'גבוהה' });
    if (high.ok) expect(high.value.confidence).toBe(1);
    if (low.ok) expect(low.value.confidence).toBe(0);
    if (missing.ok) expect(missing.value.confidence).toBe(0);
  });
});

describe('parseVoiceTask', () => {
  const validTask = {
    title: 'לרסס נגד כנימה',
    plotName: 'צפונית',
    dueDate: '2026-09-05',
    estimatedCost: 420,
    confidence: 0.8,
  };

  it('accepts a well formed extraction', () => {
    expect(parseVoiceTask(validTask).ok).toBe(true);
  });

  it('requires a title, because a task without one is not a task', () => {
    expect(parseVoiceTask({ ...validTask, title: '' }).ok).toBe(false);
    expect(parseVoiceTask({ ...validTask, title: null }).ok).toBe(false);
  });

  // אלה שדות אופציונליים אמיתיים: "לרסס מחר" בלי עלות הוא חילוץ
  // תקין לגמרי, ולא כישלון.
  it('accepts a null due date and a null cost', () => {
    const result = parseVoiceTask({ ...validTask, dueDate: null, estimatedCost: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dueDate).toBeNull();
      expect(result.value.estimatedCost).toBeNull();
    }
  });

  it('rejects a malformed due date rather than dropping it silently', () => {
    expect(parseVoiceTask({ ...validTask, dueDate: 'מחר' }).ok).toBe(false);
  });

  it('rejects a cost that arrived as a string', () => {
    expect(parseVoiceTask({ ...validTask, estimatedCost: '420' }).ok).toBe(false);
  });
});

describe('parseVoiceJournal', () => {
  const validSpray = {
    date: '2026-08-24',
    plotName: 'צפונית',
    type: 'spray',
    note: null,
    sprayPest: 'כנימת עלה',
    sprayMaterial: 'קונפידור',
    sprayDose: '0.5%',
    sprayPhiDays: 7,
    confidence: 0.85,
  };

  it('accepts a well formed spray record', () => {
    const result = parseVoiceJournal(validSpray);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sprayPhiDays).toBe(7);
  });

  // רשימה סגורה. סוג שהומצא היה נדחה ממילא בדומיין log_entry_type
  // במסד, ועדיף להיעצר כאן עם הודעה ברורה.
  it('rejects an invented action type', () => {
    expect(parseVoiceJournal({ ...validSpray, type: 'watering' }).ok).toBe(false);
    expect(parseVoiceJournal({ ...validSpray, type: 'ריסוס' }).ok).toBe(false);
  });

  // **הבדיקה הרגולטורית.** מודל ששמע "רססתי וגם קטפתי" עלול לתייג
  // קטיף ועדיין למלא ימי המתנה, ורשומת קטיף שנושאת PHI הייתה מזינה
  // חישוב "בטוח לקטיף" שקרי, שהוא החישוב הקריטי ביותר במוצר.
  it('strips spray fields when the type is not a spray', () => {
    const result = parseVoiceJournal({ ...validSpray, type: 'harvest' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sprayPest).toBeNull();
      expect(result.value.sprayMaterial).toBeNull();
      expect(result.value.sprayDose).toBeNull();
      expect(result.value.sprayPhiDays).toBeNull();
    }
  });

  it('keeps spray fields when the type really is a spray', () => {
    const result = parseVoiceJournal(validSpray);
    if (result.ok) expect(result.value.sprayPest).toBe('כנימת עלה');
  });

  it('rejects a malformed date', () => {
    expect(parseVoiceJournal({ ...validSpray, date: '2026-13-01' }).ok).toBe(false);
  });
});

describe('parseVoiceResult', () => {
  it('routes each kind to its own validator', () => {
    expect(parseVoiceResult('expense', validExpense)).toMatchObject({ value: { kind: 'expense' } });
    expect(
      parseVoiceResult('task', {
        title: 'לגזום',
        plotName: null,
        dueDate: null,
        estimatedCost: null,
        confidence: 1,
      }),
    ).toMatchObject({ value: { kind: 'task' } });
  });

  it('propagates a validation failure', () => {
    expect(parseVoiceResult('expense', { amount: 'הרבה' }).ok).toBe(false);
  });
});

// ============================================================
// המרת שם חלקה מדובר למזהה. prd.md סעיף 8: "אין ניחוש איזה סכום
// שייך לאיזו חלקה, כי זה בדיוק המקום שבו טעות תמלול הופכת לנתון
// כספי שגוי".
// ============================================================

describe('resolvePlotName', () => {
  const plots = [
    { id: 'p1', name: 'חלקה צפונית' },
    { id: 'p2', name: 'חלקה דרומית' },
    { id: 'p3', name: 'מטע הדרים' },
  ];

  it('matches a plain spoken name', () => {
    expect(resolvePlotName('דרומית', plots)).toEqual({ status: 'matched', plotId: 'p2' });
  });

  // "החלקה הדרומית" הוא מה שחקלאי באמת אומר, ולא "חלקה דרומית".
  it('matches through the definite article and the word "plot"', () => {
    expect(resolvePlotName('החלקה הדרומית', plots)).toEqual({ status: 'matched', plotId: 'p2' });
    expect(resolvePlotName('חלקה דרומית', plots)).toEqual({ status: 'matched', plotId: 'p2' });
  });

  it('ignores quotes and extra whitespace from transcription', () => {
    expect(resolvePlotName('  "צפונית"  ', plots)).toEqual({ status: 'matched', plotId: 'p1' });
  });

  it('matches a multi word plot name', () => {
    expect(resolvePlotName('מטע הדרים', plots)).toEqual({ status: 'matched', plotId: 'p3' });
  });

  // **לא לנחש.** שתי חלקות באותו שם אינן הזמנה לבחור את הראשונה.
  it('reports ambiguity rather than picking the first match', () => {
    const twins = [
      { id: 'a', name: 'חלקה דרומית' },
      { id: 'b', name: 'דרומית' },
    ];
    expect(resolvePlotName('דרומית', twins)).toEqual({ status: 'ambiguous' });
  });

  it('reports none when nothing matches, instead of a near miss', () => {
    expect(resolvePlotName('מזרחית', plots)).toEqual({ status: 'none' });
    // הטיה אינה התאמה. התאמה חלקית שגויה גרועה מלשאול את החקלאי.
    expect(resolvePlotName('דרומי', plots)).toEqual({ status: 'none' });
  });

  it('reports none when no plot was spoken at all', () => {
    expect(resolvePlotName(null, plots)).toEqual({ status: 'none' });
    expect(resolvePlotName('   ', plots)).toEqual({ status: 'none' });
    expect(resolvePlotName('חלקה', plots)).toEqual({ status: 'none' });
  });

  // ה' נחתכת רק ממילה שנשארת באורך 2 ומעלה, אחרת "הר" היה הופך ל-"ר".
  it('does not strip the definite article off a very short name', () => {
    const short = [{ id: 'h', name: 'הר' }];
    expect(resolvePlotName('הר', short)).toEqual({ status: 'matched', plotId: 'h' });
  });
});

// ============================================================
// סכמות ה-JSON. הסכמה והוולידטור מתארים את אותו חוזה משני צדדיו,
// והבדיקות כאן שומרות שהם לא ייפרדו בשקט.
// ============================================================

describe('voice JSON schemas', () => {
  it('exposes a schema for every kind', () => {
    for (const kind of VOICE_KINDS) {
      expect(voiceJsonSchema(kind)).toBeTypeOf('object');
    }
  });

  // additionalProperties: false מונע מהמודל להמציא שדות שנחשוב
  // בטעות שהם נתונים.
  it('forbids extra properties on all three schemas', () => {
    for (const schema of [
      VOICE_EXPENSE_JSON_SCHEMA,
      VOICE_TASK_JSON_SCHEMA,
      VOICE_JOURNAL_JSON_SCHEMA,
    ]) {
      expect(schema.additionalProperties).toBe(false);
    }
  });

  // required מונה את כל השדות, כולל אלה שיכולים להיות null, כי
  // "השמטתי" ו"לא מצאתי" הם מצבים שונים.
  it('requires every declared property, so null is explicit', () => {
    for (const schema of [
      VOICE_EXPENSE_JSON_SCHEMA,
      VOICE_TASK_JSON_SCHEMA,
      VOICE_JOURNAL_JSON_SCHEMA,
    ]) {
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });

  // הסכמה מבטיחה למודל שסוג הפעולה מוגבל לרשימה, והוולידטור אוכף
  // את אותה רשימה בדיוק. פיצול ביניהן היה מייצר דחיות מסתוריות.
  it('offers the journal type enum that the validator enforces', () => {
    const enumValues = VOICE_JOURNAL_JSON_SCHEMA.properties.type.enum;
    for (const type of enumValues) {
      const result = parseVoiceJournal({
        date: '2026-08-24',
        plotName: null,
        type,
        note: null,
        sprayPest: null,
        sprayMaterial: null,
        sprayDose: null,
        sprayPhiDays: null,
        confidence: 1,
      });
      expect(result.ok).toBe(true);
    }
  });
});

// רגרסיה לבאג שנתפס בבנייה: ערך מספרי פסול היה נמחק בשקט במקום
// לדחות את הרשומה. ב-sprayPhiDays זה השדה שממנו נגזר "בטוח לקטיף".
describe('invalid optional numbers are rejected, never silently dropped', () => {
  it('rejects a string PHI instead of nulling it', () => {
    const result = parseVoiceJournal({
      date: '2026-08-24',
      plotName: null,
      type: 'spray',
      note: null,
      sprayPest: 'כנימה',
      sprayMaterial: 'שמן',
      sprayDose: '2%',
      sprayPhiDays: '7',
      confidence: 1,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a negative PHI instead of nulling it', () => {
    const result = parseVoiceJournal({
      date: '2026-08-24',
      plotName: null,
      type: 'spray',
      note: null,
      sprayPest: 'כנימה',
      sprayMaterial: 'שמן',
      sprayDose: '2%',
      sprayPhiDays: -7,
      confidence: 1,
    });
    expect(result.ok).toBe(false);
  });
});
