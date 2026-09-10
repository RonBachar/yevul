import { describe, expect, it } from 'vitest';
import {
  computeEntryCost,
  computeWorkCost,
  entryCostEdited,
  parseWorkAmountInput,
  recomputedEntryCost,
  WORK_KIND_TILE_LIMIT,
  workKindOptions,
  workLogTotals,
} from './workEntry';

// שעות עבודה, עידו 6.9.2026. הבדיקות כאן שומרות על שלוש ההחלטות שהמספר
// הזה נשען עליהן, כי כולן בלתי נראות במסך עצמו: הסכום מוקפא על השורה,
// סכום שהוקלד ביד גובר על הנוסחה, והשעות והכסף נסכמים בנפרד.

describe('computeWorkCost', () => {
  it('multiplies hours by the hourly rate', () => {
    expect(computeWorkCost(3, 60)).toBe(180);
    expect(computeWorkCost(0.5, 80)).toBe(40);
  });

  // אפס שעות הוא עובדה (התחלתי ולא הספקתי), ואפס תעריף הוא החלטה של
  // המשק. שניהם מחזירים 0 ולא null, בדיוק כמו ב-computeSprayCost.
  it('treats zero hours and a zero rate as real numbers, not as missing ones', () => {
    expect(computeWorkCost(0, 60)).toBe(0);
    expect(computeWorkCost(3, 0)).toBe(0);
  });

  it('returns null when either side is missing, negative or unusable', () => {
    expect(computeWorkCost(null, 60)).toBeNull();
    expect(computeWorkCost(3, null)).toBeNull();
    expect(computeWorkCost(-1, 60)).toBeNull();
    expect(computeWorkCost(3, -60)).toBeNull();
    expect(computeWorkCost(Number.NaN, 60)).toBeNull();
    expect(computeWorkCost(3, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

// **ההחלטה שהמשתמש ביקש במפורש: הזנה ידנית תמיד מנצחת.** אפשר להקליד
// סכום בלי שעות ובלי תעריף בכלל, ומרגע שהוקלד, שינוי בשעות לא דורס
// אותו.
describe('the manual override', () => {
  it('keeps a typed total when the hours later change', () => {
    const typed = 500;
    expect(entryCostEdited(typed, null, null, 3, 60)).toBe(true);
    expect(recomputedEntryCost(typed, null, null, 8, 60, true)).toBe(500);
  });

  it('recomputes a total that was never touched', () => {
    expect(entryCostEdited(180, null, null, 3, 60)).toBe(false);
    expect(recomputedEntryCost(180, null, null, 8, 60, false)).toBe(480);
  });

  // סכום שהוקלד לבד, בלי שעות ובלי תעריף, הוא רישום תקין לחלוטין.
  it('accepts a cost typed with no hours and no rate at all', () => {
    expect(entryCostEdited(400, null, null, null, null)).toBe(true);
    expect(recomputedEntryCost(400, null, null, null, null, true)).toBe(400);
  });

  // רישום בלי עלות בכלל אינו "עריכה ידנית של אפס".
  it('does not call a missing cost an edited one', () => {
    expect(entryCostEdited(null, null, null, 3, 60)).toBe(false);
    expect(recomputedEntryCost(null, null, null, 3, 60, false)).toBe(180);
  });
});

// **One entry, one cost.** Founder's decision 2026-09-10: a journal entry that
// carries a cost writes a single expense, and its amount is the material plus the
// hours. What used to be two stored numbers -- and therefore two chances to
// subtract the same money -- is one suggestion for one box.
describe('computeEntryCost', () => {
  it('adds the material cost and the labour cost into one number', () => {
    expect(computeEntryCost(3, 40, 3, 60)).toBe(300);
  });

  // A half that cannot be computed is skipped, not read as zero: a spray with no
  // stated hours still suggests what the material cost.
  it('suggests the half it has when the other half is missing', () => {
    expect(computeEntryCost(3, 40, null, null)).toBe(120);
    expect(computeEntryCost(null, null, 3, 60)).toBe(180);
  });

  // Null, not 0: nothing to suggest is not the claim that the job was free.
  it('has nothing to suggest when neither half can be computed', () => {
    expect(computeEntryCost(null, null, null, null)).toBeNull();
    expect(computeEntryCost(3, null, null, 60)).toBeNull();
  });

  // A cost that is the sum of both halves was computed and may recompute; the same
  // number with only one half behind it was the farmer's own.
  it('calls the summed total computed and any other total edited', () => {
    expect(entryCostEdited(300, 3, 40, 3, 60)).toBe(false);
    expect(entryCostEdited(120, 3, 40, 3, 60)).toBe(true);
  });
});

describe('parseWorkAmountInput', () => {
  // תיבה ריקה היא "לא הוזן", תיבה לא קריאה היא לא אותו דבר, ואסור לה
  // להפוך לזה בשקט. אותה מוסכמה בדיוק כמו בתיבות של עלות הריסוס.
  it('separates an empty box from an unreadable one', () => {
    expect(parseWorkAmountInput('')).toBeNull();
    expect(parseWorkAmountInput('   ')).toBeNull();
    expect(parseWorkAmountInput('שלוש')).toBeUndefined();
    expect(parseWorkAmountInput('-2')).toBeUndefined();
    expect(parseWorkAmountInput('3.5')).toBe(3.5);
    expect(parseWorkAmountInput('0')).toBe(0);
  });
});

describe('workLogTotals', () => {
  it('sums the hours and the money of the entries on screen', () => {
    const totals = workLogTotals([
      { workHours: 3, cost: 180 },
      { workHours: 2.5, cost: 150 },
    ]);
    expect(totals.entries).toBe(2);
    expect(totals.hours).toBe(5.5);
    expect(totals.cost).toBe(330);
  });

  // **שתי הסכימות עצמאיות.** רישום עם שעות ובלי עלות קיים (משק שטרם
  // הזין תעריף), ורישום עם סכום ובלי שעות קיים (סכום שהוקלד ישר). גזירת
  // אחת מהשנייה הייתה ממציאה מספר בשני המקרים.
  it('counts hours with no cost and a cost with no hours, without inventing either', () => {
    const totals = workLogTotals([
      { workHours: 4, cost: null },
      { workHours: null, cost: 250 },
    ]);
    expect(totals.entries).toBe(2);
    expect(totals.hours).toBe(4);
    expect(totals.cost).toBe(250);
  });

  it('ignores rows that carry neither', () => {
    const totals = workLogTotals([
      { workHours: null, cost: null },
      { workHours: 1, cost: 60 },
    ]);
    expect(totals.entries).toBe(1);
    expect(totals.hours).toBe(1);
    expect(totals.cost).toBe(60);
  });

  // שורה אחת מקולקלת לא מרעילה את כל המסך.
  it('drops an unusable number instead of poisoning the total', () => {
    const totals = workLogTotals([
      { workHours: Number.NaN, cost: 100 },
      { workHours: 2, cost: 120 },
    ]);
    expect(totals.hours).toBe(2);
    expect(totals.cost).toBe(220);
  });

  it('is zero for an empty list', () => {
    expect(workLogTotals([])).toEqual({ entries: 0, hours: 0, cost: 0 });
  });
});

// ============================================================
// The kind-of-work grid. Item (ו) of Ido's first feedback round, the half that
// was still open: he logs three hours of pruning, has to pick "אחר" for the type,
// and has nowhere to say what he actually did.
//
// The grid is the shortcut so he types it once. **What these tests hold is that
// it stays a shortcut**: it never becomes a list he has to pick from, and it
// never loses the value that is already on the record in front of him.
// ============================================================

describe('workKindOptions', () => {
  it('offers the farm’s own recent kinds of work, newest first', () => {
    expect(workKindOptions(['גיזום', 'תיקון גדר', 'ניקוי שוחות'])).toEqual([
      'גיזום',
      'תיקון גדר',
      'ניקוי שוחות',
    ]);
  });

  // Newest-first and not most-used, decided on seasonality: pruning happens for a
  // few weeks in winter and harvest for a few weeks in summer, so a frequency
  // ranking built over a year keeps offering January's work in August. Here
  // 'גיזום' is the older, more frequent value and still comes second.
  it('ranks by recency and not by how often a kind was used', () => {
    expect(workKindOptions(['ריסוס', 'גיזום', 'גיזום', 'גיזום'])).toEqual(['ריסוס', 'גיזום']);
  });

  it('trims, drops blanks and nulls, and shows each kind once', () => {
    expect(workKindOptions(['  גיזום  ', 'גיזום', '', '   ', null, 'קטיף'])).toEqual([
      'גיזום',
      'קטיף',
    ]);
  });

  it('caps the grid at the tile limit', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(workKindOptions(many)).toHaveLength(WORK_KIND_TILE_LIMIT);
  });

  // Reopening a six-month-old entry whose kind of work has since dropped off the
  // end of the last fifty rows must not look like the value got lost. First
  // square, and the grid stays the same length so the rows under it cannot move.
  it('puts the value already on the record first, even when history has forgotten it', () => {
    const options = workKindOptions(['a', 'b', 'c', 'd', 'e'], 'תיקון גדר');
    expect(options[0]).toBe('תיקון גדר');
    expect(options).toHaveLength(WORK_KIND_TILE_LIMIT);
  });

  it('does not repeat a selected value the history still remembers', () => {
    expect(workKindOptions(['גיזום', 'קטיף'], 'קטיף')).toEqual(['גיזום', 'קטיף']);
  });

  // **The grid is never the whole answer.** A farmer can always type something no
  // farm has ever typed -- manual entry always wins -- so an empty history is a
  // real state that returns an empty grid rather than a fallback list of guesses.
  it('offers nothing rather than inventing a starter list', () => {
    expect(workKindOptions([])).toEqual([]);
    expect(workKindOptions([null, '  '])).toEqual([]);
  });
});
