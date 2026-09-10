import { describe, expect, it } from 'vitest';
import {
  expectedIncomeFor,
  expectedPriceDisplay,
  expectedYieldDisplay,
  plotProfitForecast,
  staleForecastSince,
} from './plots';
import type { CropCycle } from './plots';

// The default is a row as it exists today for every farm: a yield unit and no
// price unit, which the read path treats as "priced in the yield's own unit".
function cropCycle(overrides: Partial<CropCycle> = {}): CropCycle {
  return {
    id: 'cc-1',
    plotId: 'plot-1',
    name: 'זיתים',
    season: '2026',
    yieldUnit: 'kg',
    priceUnit: null,
    expectedYieldPerArea: 300,
    expectedPricePerUnit: 60,
    expectedHarvestDate: null,
    forecastUpdatedAt: null,
    ...overrides,
  };
}

// שורות התצוגה בטאב הרווחיות. עידו העיר שגידולים מסוימים נספרים
// ביחידות ולא נשקלים, ולכן שתי משפחות המדידה נבדקות כאן במפורש.
describe('expectedYieldDisplay', () => {
  it('shows both units, yield and area', () => {
    expect(expectedYieldDisplay(cropCycle(), 'dunam')).toBe('300 קילו לדונם');
  });

  it('reads correctly for a counted crop', () => {
    expect(expectedYieldDisplay(cropCycle({ yieldUnit: 'unit' }), 'dunam')).toBe('300 יחידה לדונם');
  });

  // A row written before the list narrowed to three units. Its text is not one
  // of them and it is shown exactly as the farmer left it.
  it('shows a legacy free-text unit unchanged', () => {
    expect(expectedYieldDisplay(cropCycle({ yieldUnit: 'ארגזים' }), 'dunam')).toBe(
      '300 ארגזים לדונם',
    );
  });

  // הבאג שהתגלה: הגרסה הקודמת השלימה "יחידה" והציגה "300 יחידה לדונם"
  // לחלקה שאין לה יחידה בכלל, כלומר טענה נתון שלא קיים, ובדיוק במילה
  // שחקלאי שסופר פירות משתמש בה בעצמו.
  it('never invents a unit when none is set', () => {
    const display = expectedYieldDisplay(cropCycle({ yieldUnit: null }), 'dunam');
    expect(display).toBe('300 לדונם');
    expect(display).not.toContain('יחידה');
  });

  it('falls back to the bare number when the plot has no area unit either', () => {
    expect(expectedYieldDisplay(cropCycle({ yieldUnit: null }), null)).toBe('300');
  });

  it('reports an unset forecast rather than rendering a zero', () => {
    expect(expectedYieldDisplay(cropCycle({ expectedYieldPerArea: null }), 'dunam')).toBe(
      'לא הוזן עדיין',
    );
  });
});

// סיכום צפי הרווח בראש מסך החלקה. עידו ביקש שהמספר ייקרא "צפי רווח"
// ולא "רווח", כי טעות בהזנת נתון עלולה להיראות כרווח אמיתי. הבדיקות
// כאן שומרות על ההבחנה במקום שבה היא מיוצגת בקוד: היעדר נתונים מחזיר
// null ולא 0, והיעדר מעקב הוצאות מסומן בנפרד מאפס הוצאות.
describe('plotProfitForecast', () => {
  it('subtracts tracked expenses from expected income', () => {
    const result = plotProfitForecast(40, cropCycle(), 408000);
    expect(result?.expectedIncome).toBe(720000);
    expect(result?.profit).toBe(312000);
    expect(result?.expensesTracked).toBe(true);
  });

  it('reports a loss when expenses exceed expected income', () => {
    const result = plotProfitForecast(40, cropCycle(), 900000);
    expect(result?.profit).toBeLessThan(0);
  });

  // **One cost line, founder's decision 2026-09-10.** This used to take a spray
  // cost and a work cost beside the expenses and subtract all three, which is how
  // the same sack of material could be charged twice: once off the journal row and
  // once off the expense the farmer also filed for it. The journal writes an
  // expense now, so the expenses figure is every shekel the plot cost and there is
  // nothing else to subtract. The test that guards it is a signature that will not
  // accept a second cost.
  it('subtracts expenses and nothing else', () => {
    const result = plotProfitForecast(40, cropCycle(), 408000);
    expect(result?.expenses).toBe(408000);
    expect(result?.profit).toBe(720000 - 408000);
    expect(result).not.toHaveProperty('sprayCost');
    expect(result).not.toHaveProperty('workCost');
  });

  // ההבחנה שמפעילה את חיווי ה-Wheat. "אין מעקב הוצאות" הוא חוסר ידיעה,
  // "אפס הוצאות" הוא עובדה, ושניהם נותנים אותו רווח מספרית.
  it('separates untracked expenses from genuinely zero expenses', () => {
    const untracked = plotProfitForecast(40, cropCycle(), null);
    const zero = plotProfitForecast(40, cropCycle(), 0);
    expect(untracked?.profit).toBe(zero?.profit);
    expect(untracked?.expensesTracked).toBe(false);
    expect(zero?.expensesTracked).toBe(true);
  });

  // עובד רואה את שדות התחזית ממוסכים ל-null דרך crop_cycles_view, ולכן
  // אין לו הכנסה לחשב והכותרת כולה לא מרונדרת. אכיפה בשכבת השאילתה.
  it('returns null when the forecast columns are masked, as they are for a worker', () => {
    const masked = cropCycle({ expectedYieldPerArea: null, expectedPricePerUnit: null });
    expect(plotProfitForecast(40, masked, null)).toBeNull();
  });

  it('returns null rather than zero when the plot has no area', () => {
    expect(plotProfitForecast(null, cropCycle(), null)).toBeNull();
  });

  it('returns null when there is no crop cycle at all', () => {
    expect(plotProfitForecast(40, null, null)).toBeNull();
  });
});

describe('expectedIncomeFor', () => {
  it('multiplies area by yield per area by price per unit', () => {
    expect(expectedIncomeFor(40, cropCycle())).toBe(720000);
  });

  // **The bug this whole change is about.** Ido states a yield in tons per dunam
  // and a price per kilo; before the second unit column the two numbers were
  // multiplied as if they shared a unit, and the income came out a thousand
  // times too small with nothing on screen to say so.
  it('converts tons of yield into the kilos the price is quoted in', () => {
    const cycle = cropCycle({
      yieldUnit: 'ton',
      priceUnit: 'kg',
      expectedYieldPerArea: 3,
      expectedPricePerUnit: 4,
    });
    expect(expectedIncomeFor(8, cycle)).toBe(96000);
  });

  it('converts the other way too, kilos of yield priced by the ton', () => {
    const cycle = cropCycle({
      yieldUnit: 'kg',
      priceUnit: 'ton',
      expectedYieldPerArea: 3000,
      expectedPricePerUnit: 4000,
    });
    expect(expectedIncomeFor(8, cycle)).toBe(96000);
  });

  // Every row written before price_unit existed. Reading a null price unit as
  // the yield's own unit is what keeps their number exactly where it was.
  it('leaves a row from before price_unit computing exactly as it did', () => {
    expect(expectedIncomeFor(40, cropCycle({ priceUnit: null }))).toBe(720000);
    expect(expectedIncomeFor(40, cropCycle({ yieldUnit: 'ארגזים', priceUnit: null }))).toBe(720000);
  });

  it('returns null when any of the three inputs is missing', () => {
    expect(expectedIncomeFor(null, cropCycle())).toBeNull();
    expect(expectedIncomeFor(40, cropCycle({ expectedYieldPerArea: null }))).toBeNull();
    expect(expectedIncomeFor(40, cropCycle({ expectedPricePerUnit: null }))).toBeNull();
  });

  // A count against a weight does not convert, so there is no honest income.
  // null, exactly as for a missing yield, rather than a plausible wrong number.
  it('returns null rather than guessing what one piece of fruit weighs', () => {
    expect(expectedIncomeFor(40, cropCycle({ yieldUnit: 'unit', priceUnit: 'kg' }))).toBeNull();
  });
});

describe('expectedPriceDisplay', () => {
  it('pairs the amount with the unit it refers to', () => {
    expect(expectedPriceDisplay(cropCycle(), 'ILS')).toContain('/ קילו');
  });

  // **The price line follows the PRICE unit now.** A farmer with tons of yield
  // priced by the kilo used to read "60 ₪ / טון" here, with no hint of the slip.
  it('names the unit the price is actually quoted in, not the yield unit', () => {
    const display = expectedPriceDisplay(cropCycle({ yieldUnit: 'ton', priceUnit: 'kg' }), 'ILS');
    expect(display).toContain('/ קילו');
    expect(display).not.toContain('טון');
  });

  it('stays grammatical for a legacy plural unit', () => {
    const display = expectedPriceDisplay(cropCycle({ yieldUnit: 'ארגזים' }), 'ILS');
    expect(display).toContain('/ ארגזים');
    expect(display).not.toContain('לארגזים');
  });

  it('shows the amount alone when no unit is set', () => {
    const display = expectedPriceDisplay(cropCycle({ yieldUnit: null }), 'ILS');
    expect(display).not.toContain('/');
    expect(display).not.toContain('יחידה');
  });

  it('reports an unset price rather than rendering a zero', () => {
    expect(expectedPriceDisplay(cropCycle({ expectedPricePerUnit: null }), 'ILS')).toBe(
      'לא הוזן עדיין',
    );
  });
});

// נודניק התיישנות הצפי, design.md, Forecast Update, "Staleness nudge".
// now מוזרק, ולכן הבדיקות אינן תלויות במועד הרצתן.
describe('staleForecastSince', () => {
  const now = new Date('2026-08-29T10:00:00Z');

  it('reports the update date when the forecast is older than the threshold', () => {
    const cycle = cropCycle({ forecastUpdatedAt: '2026-04-10T08:00:00Z' });
    expect(staleForecastSince(cycle, now)).toBe('2026-04-10T08:00:00Z');
  });

  it('stays quiet while the forecast is still fresh', () => {
    const cycle = cropCycle({ forecastUpdatedAt: '2026-07-20T08:00:00Z' });
    expect(staleForecastSince(cycle, now)).toBeNull();
  });

  // חלקה שהחקלאי רק הגדיר לה יבול ומחיר בפעם הראשונה אינה מיושנת,
  // ונודניק מיד אחרי ההזנה הראשונה מלמד להתעלם ממנו.
  it('stays quiet when the forecast was never updated', () => {
    expect(staleForecastSince(cropCycle({ forecastUpdatedAt: null }), now)).toBeNull();
  });

  it('stays quiet when there is no crop cycle at all', () => {
    expect(staleForecastSince(null, now)).toBeNull();
  });

  // setMonth היה מנרמל 31 בפברואר ל-3 במרץ ומזיז את הסף קדימה, כלומר
  // מקדים את הנודניק בכמה ימים. נמצא בקוד ריוויו של שלב 4.
  it('does not drift when the month before has fewer days', () => {
    const endOfMay = new Date('2026-05-31T10:00:00Z');
    // בדיוק שלושה חודשים אחורה מ-31 במאי הוא 28 בפברואר (Date.UTC
    // מגלגל 31 בפברואר ליום האחרון האפשרי בלי לדלג על מרץ).
    const justInside = cropCycle({ forecastUpdatedAt: '2026-03-01T00:00:00Z' });
    expect(staleForecastSince(justInside, endOfMay)).toBeNull();
  });

  it('crosses the year boundary correctly', () => {
    const january = new Date('2026-01-15T10:00:00Z');
    const old = cropCycle({ forecastUpdatedAt: '2025-10-01T00:00:00Z' });
    const fresh = cropCycle({ forecastUpdatedAt: '2025-11-20T00:00:00Z' });
    expect(staleForecastSince(old, january)).toBe('2025-10-01T00:00:00Z');
    expect(staleForecastSince(fresh, january)).toBeNull();
  });

  it('stays quiet on a malformed timestamp rather than nagging wrongly', () => {
    expect(staleForecastSince(cropCycle({ forecastUpdatedAt: 'not-a-date' }), now)).toBeNull();
  });
});
