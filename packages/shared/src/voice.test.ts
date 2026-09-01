import { describe, expect, it } from 'vitest';
import {
  parseVoiceExpense,
  parseVoiceJournal,
  parseVoiceTask,
  resolvePlotName,
  voiceJsonSchema,
  voiceWireJsonSchema,
  VOICE_EXPENSE_JSON_SCHEMA,
  VOICE_KINDS,
} from './voice';

// סכמות החילוץ מקול, שלב 5, prd.md נספח א.5.
//
// **הטסטים כאן מתייחסים לפלט המודל כעוין.** מודל יכול להחזיר שדה
// חסר, מספר כמחרוזת, תאריך מומצא או ערך מחוץ לרשימה סגורה, וכל אלה
// מגיעים כ-JSON תקין תחבירית. זו שכבת ההגנה היחידה בין המודל למסד.

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

  // **הבדיקה הכי חשובה בקובץ.** מודל שמחזיר "1500" במקום 1500 החזיר
  // JSON תקין, ובלי הבדיקה הזו הסכום היה מגיע למסד כמחרוזת או נמחק
  // בשקט. זה נתון כספי, ועדיף לבקש הקלטה חוזרת מלנחש.
  it('rejects an amount that arrived as a string, not a number', () => {
    const result = parseVoiceExpense({ ...validExpense, amount: '1500' });
    expect(result.ok).toBe(false);
  });

  it('rejects a zero or negative amount', () => {
    expect(parseVoiceExpense({ ...validExpense, amount: 0 }).ok).toBe(false);
    expect(parseVoiceExpense({ ...validExpense, amount: -50 }).ok).toBe(false);
  });

  it('rejects a date that is not a real calendar date', () => {
    expect(parseVoiceExpense({ ...validExpense, date: '2026-02-31' }).ok).toBe(false);
    expect(parseVoiceExpense({ ...validExpense, date: 'אתמול' }).ok).toBe(false);
    expect(parseVoiceExpense({ ...validExpense, date: '30/08/2026' }).ok).toBe(false);
  });

  // מודל שלא מצא ערך מחזיר לעיתים מחרוזת ריקה במקום null, ובלי הניקוי
  // היינו שומרים שם הוצאה ריק במסד.
  it('turns an empty or whitespace string into null', () => {
    const result = parseVoiceExpense({ ...validExpense, name: '   ', plotName: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBeNull();
      expect(result.value.plotName).toBeNull();
    }
  });

  it('clamps confidence into range instead of rejecting the whole extraction', () => {
    const high = parseVoiceExpense({ ...validExpense, confidence: 7 });
    const missing = parseVoiceExpense({ ...validExpense, confidence: undefined });
    expect(high.ok && high.value.confidence).toBe(1);
    expect(missing.ok && missing.value.confidence).toBe(0);
  });

  // prd.md סעיף 8, "הקלטה אחת, הוצאה אחת". הדגל חייב להיות בוליאני
  // אמיתי, כי כל ערך truthy אחר היה מדליק את ההודעה בטעות.
  it('treats hasMoreItems as a strict boolean', () => {
    const yes = parseVoiceExpense({ ...validExpense, hasMoreItems: true });
    const stringy = parseVoiceExpense({ ...validExpense, hasMoreItems: 'true' });
    expect(yes.ok && yes.value.hasMoreItems).toBe(true);
    expect(stringy.ok && stringy.value.hasMoreItems).toBe(false);
  });

  it('rejects a non object, including null and an array', () => {
    expect(parseVoiceExpense(null).ok).toBe(false);
    expect(parseVoiceExpense([validExpense]).ok).toBe(false);
    expect(parseVoiceExpense('טקסט').ok).toBe(false);
  });
});

describe('parseVoiceTask', () => {
  const validTask = {
    title: 'לדלל את המטע',
    plotName: null,
    dueDate: null,
    estimatedCost: null,
    confidence: 0.8,
  };

  it('accepts a task with only a title', () => {
    expect(parseVoiceTask(validTask).ok).toBe(true);
  });

  it('requires a title', () => {
    expect(parseVoiceTask({ ...validTask, title: '  ' }).ok).toBe(false);
    expect(parseVoiceTask({ ...validTask, title: null }).ok).toBe(false);
  });

  // null פירושו "לא נאמר תאריך", וזה תקין. ערך פסול פירושו שהמודל
  // לא כיבד את הסכמה, וזה נדחה.
  it('separates a missing due date from a malformed one', () => {
    expect(parseVoiceTask({ ...validTask, dueDate: null }).ok).toBe(true);
    expect(parseVoiceTask({ ...validTask, dueDate: 'מחר' }).ok).toBe(false);
  });

  // **עלות פסולה נדחית ולא נמחקת בשקט.** הגרסה הראשונה של העוזר
  // החזירה null על ערך פסול, ולכן עלות שהגיעה כמחרוזת הייתה נעלמת
  // והמשימה נשמרת בלי עלות בלי שאיש ידע.
  it('rejects a malformed cost instead of silently dropping it', () => {
    expect(parseVoiceTask({ ...validTask, estimatedCost: '420' }).ok).toBe(false);
    expect(parseVoiceTask({ ...validTask, estimatedCost: -5 }).ok).toBe(false);
    expect(parseVoiceTask({ ...validTask, estimatedCost: null }).ok).toBe(true);
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

  it('rejects an action type that is not in the closed list', () => {
    expect(parseVoiceJournal({ ...validSpray, type: 'ריסוס' }).ok).toBe(false);
    expect(parseVoiceJournal({ ...validSpray, type: 'weeding' }).ok).toBe(false);
  });

  // **החשוב ביותר כאן.** מודל ששמע "רססתי וגם קטפתי" עלול לתייג קטיף
  // ועדיין למלא חומר וימי המתנה. רשומת קטיף שנושאת PHI הייתה מזינה
  // חישוב "בטוח לקטיף" שקרי, שהוא החישוב הרגולטורי הקריטי במוצר.
  it('clears spray fields when the type is not a spray', () => {
    const result = parseVoiceJournal({ ...validSpray, type: 'harvest' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sprayPest).toBeNull();
      expect(result.value.sprayMaterial).toBeNull();
      expect(result.value.sprayDose).toBeNull();
      expect(result.value.sprayPhiDays).toBeNull();
    }
  });

  it('rejects malformed PHI days rather than dropping them', () => {
    expect(parseVoiceJournal({ ...validSpray, sprayPhiDays: '7' }).ok).toBe(false);
    expect(parseVoiceJournal({ ...validSpray, sprayPhiDays: null }).ok).toBe(true);
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

  it('matches after stripping the word חלקה and the definite article', () => {
    expect(resolvePlotName('החלקה הדרומית', plots)).toEqual({ status: 'matched', plotId: 'p2' });
    expect(resolvePlotName('צפונית', plots)).toEqual({ status: 'matched', plotId: 'p1' });
    expect(resolvePlotName('חלקה צפונית', plots)).toEqual({ status: 'matched', plotId: 'p1' });
  });

  it('matches a multi word name', () => {
    expect(resolvePlotName('מטע הדרים', plots)).toEqual({ status: 'matched', plotId: 'p3' });
  });

  it('reports none when nothing matches, rather than picking the closest', () => {
    expect(resolvePlotName('מערבית', plots)).toEqual({ status: 'none' });
    expect(resolvePlotName(null, plots)).toEqual({ status: 'none' });
    expect(resolvePlotName('   ', plots)).toEqual({ status: 'none' });
  });

  // **שתי התאמות מחזירות ambiguous ולא את הראשונה.** בחירה שרירותית
  // כאן היא בדיוק הניחוש שה-PRD אוסר, והמסך ישאל את החקלאי.
  it('reports ambiguous when two plots normalise to the same name', () => {
    const twins = [
      { id: 'a', name: 'חלקה דרומית' },
      { id: 'b', name: 'הדרומית' },
    ];
    expect(resolvePlotName('דרומית', twins)).toEqual({ status: 'ambiguous' });
  });

  // ה' נחתכת רק ממילה שנשארת באורך 2 ומעלה, כדי לא להפוך "הר" ל-"ר".
  it('does not strip the definite article off a very short word', () => {
    const shortNamed = [{ id: 'x', name: 'הר' }];
    expect(resolvePlotName('הר', shortNamed)).toEqual({ status: 'matched', plotId: 'x' });
  });

  it('ignores quotes and extra whitespace', () => {
    expect(resolvePlotName('  "חלקה   צפונית"  ', plots)).toEqual({
      status: 'matched',
      plotId: 'p1',
    });
  });
});

// ============================================================
// הסכמה שנשלחת למודל והוולידטור שבודק את מה שחזר מתארים את אותו
// חוזה משני צדדיו, ולכן הם חייבים להישאר מסונכרנים.
// ============================================================

describe('voiceJsonSchema', () => {
  it('returns a distinct schema for each of the three kinds', () => {
    const schemas = VOICE_KINDS.map((kind) => voiceJsonSchema(kind));
    expect(new Set(schemas).size).toBe(3);
  });

  // additionalProperties: false מונע מהמודל להמציא שדות שנחשוב
  // בטעות שהם נתונים.
  it('closes every schema to unknown fields', () => {
    for (const kind of VOICE_KINDS) {
      const schema = voiceJsonSchema(kind) as { additionalProperties: boolean };
      expect(schema.additionalProperties).toBe(false);
    }
  });

  // required מונה את כל השדות, כולל אלה שיכולים להיות null, כי
  // "השמטתי" ו"לא מצאתי" הם מצבים שונים.
  it('requires every declared property, so a missing field is never silent', () => {
    for (const kind of VOICE_KINDS) {
      const schema = voiceJsonSchema(kind) as {
        required: readonly string[];
        properties: Record<string, unknown>;
      };
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });
});

// ============================================================
// גרסת החוט, כלומר מה שבאמת נשלח לספק.
//
// **שתי בעיות בשליחת הסכמות הקנוניות כמו שהן.** מילות המפתח המספריות
// אינן נתמכות ב-structured outputs וספק שמקבל אותן דוחה ב-400, והבקשה
// נשלחת עם מערך models, כלומר יש מסלול אמיתי שבו ספק אחר מקבל אותן.
// ובנוסף חסר transcript, ובלעדיו חילוץ שנכשל משאיר את החקלאי מול מסך
// ריק במקום מול "זה מה ששמענו".
// ============================================================

// צילום של שלוש הסכמות הקנוניות ברגע טעינת המודול, לפני שאיזו בדיקה
// הספיקה לקרוא ל-voiceWireJsonSchema. JSON.stringify שומר גם את סדר
// המפתחות, ולכן הוא תופס גם הוספה, גם מחיקה וגם שינוי סדר.
const CANONICAL_SNAPSHOT = JSON.stringify(VOICE_KINDS.map((kind) => voiceJsonSchema(kind)));

// אוסף כל שם מפתח בעץ, בכל עומק, כדי שהבדיקה לא תסתמך על היכרות עם
// המבנה. סכמה מקוננת עתידית תיבדק אוטומטית.
function allKeys(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) allKeys(item, found);
    return found;
  }
  if (typeof node !== 'object' || node === null) return found;
  for (const [key, value] of Object.entries(node)) {
    found.push(key);
    allKeys(value, found);
  }
  return found;
}

type SchemaShape = {
  additionalProperties: boolean;
  required: readonly string[];
  properties: Record<string, { type?: unknown; description?: string }>;
};

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('voiceWireJsonSchema', () => {
  // ספק שמקבל את מילות המפתח האלה דוחה את כל הבקשה ב-400.
  it('drops every numeric constraint keyword, at any depth, in all three kinds', () => {
    for (const kind of VOICE_KINDS) {
      const keys = allKeys(voiceWireJsonSchema(kind));
      expect(keys).not.toContain('minimum');
      expect(keys).not.toContain('maximum');
      expect(keys).not.toContain('exclusiveMinimum');
      expect(keys).not.toContain('exclusiveMaximum');
    }
  });

  // **האילוץ יורד, המידע לא.** הוא עובר מאילוץ פורמלי לתיאור בשפה
  // טבעית שהמודל קורא, והאכיפה עצמה נשארת ב-finitePositive
  // וב-clampConfidence שרצים על מה שחזר.
  it('moves the bounds into the description instead of losing them', () => {
    const expense = voiceWireJsonSchema('expense') as SchemaShape;

    const amount = expense.properties.amount!.description!;
    expect(amount).toContain('הסכום ששולם, מספר בלבד');
    expect(amount).toContain('מספר חיובי');

    // **התיאור של confidence כבר אמר את הטווח במילים**, ולכן הוא נשאר
    // בדיוק כפי שהיה ולא מקבל את אותו משפט פעמיים. ההשוואה היא מול
    // המקור עצמו ולא מול מחרוזת שהודפסה כאן, כדי שהבדיקה לא תעבור
    // בטעות על טקסט דומה אבל לא זהה.
    const canonicalConfidence = VOICE_EXPENSE_JSON_SCHEMA.properties.confidence.description;
    const confidence = expense.properties.confidence!.description!;
    expect(confidence).toBe(canonicalConfidence);
    expect(occurrences(confidence, 'בין 0 ל-1')).toBe(1);
  });

  it('adds transcript to properties and to required, in all three kinds', () => {
    for (const kind of VOICE_KINDS) {
      const schema = voiceWireJsonSchema(kind) as SchemaShape;
      expect(schema.properties.transcript).toBeDefined();
      expect(schema.properties.transcript!.type).toBe('string');
      expect(schema.required).toContain('transcript');
    }
  });

  // הסכמה נשלחת סגורה, ושדה שאינו required בסכמה סגורה הוא בדיוק המצב
  // שספקי structured outputs דוחים.
  it('stays closed and fully required after the rewrite', () => {
    for (const kind of VOICE_KINDS) {
      const schema = voiceWireJsonSchema(kind) as SchemaShape;
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });

  // **הבדיקה שתופסת מוטציה בטעות.** הסכמות הקנוניות הן as const,
  // ו-CONFIDENCE_FIELD ו-PLOT_NAME_FIELD הם אותו אובייקט בשלוש הסכמות,
  // כלומר עריכה במקום הייתה מזהמת את שלושתן בבת אחת ובשקט.
  it('leaves the canonical schemas byte for byte as they were', () => {
    for (const kind of VOICE_KINDS) voiceWireJsonSchema(kind);

    expect(JSON.stringify(VOICE_KINDS.map((kind) => voiceJsonSchema(kind)))).toBe(
      CANONICAL_SNAPSHOT,
    );

    const canonical = VOICE_EXPENSE_JSON_SCHEMA;
    expect(canonical.properties.amount.exclusiveMinimum).toBe(0);
    expect(canonical.properties.confidence.minimum).toBe(0);
    expect(canonical.properties.confidence.maximum).toBe(1);
    expect([...canonical.required]).not.toContain('transcript');
    expect(Object.keys(canonical.properties)).not.toContain('transcript');
  });

  // **transcript אינו חלק מהחוזה של הרשומה.** הוא נתון תצוגה למקרה
  // שהחילוץ נכשל, ה-Worker קורא אותו מהאובייקט הגולמי לפני הוולידציה,
  // והוולידטורים אמורים פשוט להתעלם ממנו ולא להיחנק עליו.
  it('leaves the validators unbothered by an extra transcript key', () => {
    const spoken = 'קניתי סולר בחלקה הדרומית באלף וחמש מאות שקל';

    const expense = parseVoiceExpense({ ...validExpense, transcript: spoken });
    expect(expense.ok).toBe(true);
    if (expense.ok) {
      expect(expense.value.amount).toBe(1500);
      expect('transcript' in expense.value).toBe(false);
    }

    const task = parseVoiceTask({
      title: 'לדלל את המטע',
      plotName: null,
      dueDate: null,
      estimatedCost: null,
      confidence: 0.8,
      transcript: spoken,
    });
    expect(task.ok).toBe(true);
    if (task.ok) expect('transcript' in task.value).toBe(false);

    const journal = parseVoiceJournal({
      date: '2026-08-24',
      plotName: 'צפונית',
      type: 'spray',
      note: null,
      sprayPest: 'כנימת עלה',
      sprayMaterial: 'קונפידור',
      sprayDose: '0.5%',
      sprayPhiDays: 7,
      confidence: 0.85,
      transcript: spoken,
    });
    expect(journal.ok).toBe(true);
    if (journal.ok) {
      expect(journal.value.sprayPhiDays).toBe(7);
      expect('transcript' in journal.value).toBe(false);
    }
  });
});
