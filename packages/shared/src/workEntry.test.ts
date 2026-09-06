import { describe, expect, it } from 'vitest';
import {
  computeWorkCost,
  parseWorkAmountInput,
  recomputedWorkCost,
  workCostEdited,
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
    expect(workCostEdited(typed, 3, 60)).toBe(true);
    expect(recomputedWorkCost(typed, 8, 60, true)).toBe(500);
  });

  it('recomputes a total that was never touched', () => {
    expect(workCostEdited(180, 3, 60)).toBe(false);
    expect(recomputedWorkCost(180, 8, 60, false)).toBe(480);
  });

  // סכום שהוקלד לבד, בלי שעות ובלי תעריף, הוא רישום תקין לחלוטין.
  it('accepts a cost typed with no hours and no rate at all', () => {
    expect(workCostEdited(400, null, null)).toBe(true);
    expect(recomputedWorkCost(400, null, null, true)).toBe(400);
  });

  // רישום בלי עלות בכלל אינו "עריכה ידנית של אפס".
  it('does not call a missing cost an edited one', () => {
    expect(workCostEdited(null, 3, 60)).toBe(false);
    expect(recomputedWorkCost(null, 3, 60, false)).toBe(180);
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
      { workHours: 3, workCost: 180 },
      { workHours: 2.5, workCost: 150 },
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
      { workHours: 4, workCost: null },
      { workHours: null, workCost: 250 },
    ]);
    expect(totals.entries).toBe(2);
    expect(totals.hours).toBe(4);
    expect(totals.cost).toBe(250);
  });

  it('ignores rows that carry neither', () => {
    const totals = workLogTotals([
      { workHours: null, workCost: null },
      { workHours: 1, workCost: 60 },
    ]);
    expect(totals.entries).toBe(1);
    expect(totals.hours).toBe(1);
    expect(totals.cost).toBe(60);
  });

  // שורה אחת מקולקלת לא מרעילה את כל המסך.
  it('drops an unusable number instead of poisoning the total', () => {
    const totals = workLogTotals([
      { workHours: Number.NaN, workCost: 100 },
      { workHours: 2, workCost: 120 },
    ]);
    expect(totals.hours).toBe(2);
    expect(totals.cost).toBe(220);
  });

  it('is zero for an empty list', () => {
    expect(workLogTotals([])).toEqual({ entries: 0, hours: 0, cost: 0 });
  });
});
