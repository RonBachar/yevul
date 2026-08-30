import { describe, expect, it } from 'vitest';
import {
  expectedIncomeFor,
  expectedPriceDisplay,
  expectedYieldDisplay,
  isCustomYieldUnit,
  plotProfitForecast,
  staleForecastSince,
  yieldUnitPresets,
} from './plots';
import type { CropCycle } from './plots';

function cropCycle(overrides: Partial<CropCycle> = {}): CropCycle {
  return {
    id: 'cc-1',
    plotId: 'plot-1',
    name: 'זיתים',
    season: '2026',
    yieldUnit: 'ק"ג',
    expectedYieldPerArea: 300,
    expectedPricePerUnit: 60,
    forecastUpdatedAt: null,
    ...overrides,
  };
}

// שורות התצוגה בטאב הרווחיות. עידו העיר שגידולים מסוימים נספרים
// ביחידות ולא נשקלים, ולכן שתי משפחות המדידה נבדקות כאן במפורש.
describe('expectedYieldDisplay', () => {
  it('shows both units, yield and area', () => {
    expect(expectedYieldDisplay(cropCycle(), 'dunam')).toBe('300 ק"ג לדונם');
  });

  it('reads correctly for a counted crop', () => {
    expect(expectedYieldDisplay(cropCycle({ yieldUnit: 'יחידות' }), 'dunam')).toBe(
      '300 יחידות לדונם',
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

  it('returns null when any of the three inputs is missing', () => {
    expect(expectedIncomeFor(null, cropCycle())).toBeNull();
    expect(expectedIncomeFor(40, cropCycle({ expectedYieldPerArea: null }))).toBeNull();
    expect(expectedIncomeFor(40, cropCycle({ expectedPricePerUnit: null }))).toBeNull();
  });
});

// בורר יחידת היבול מציע את הנפוצות ומשאיר "אחר" לכל השאר. הבדיקות
// מקבעות שהעמודה נשארת טקסט חופשי בפועל, ושערך שנשמר לפני שההצעות
// היו קיימות לא נמחק אלא נפתח כ"אחר".
describe('yieldUnitPresets', () => {
  it('covers both measurement families, weight and count', () => {
    const presets = yieldUnitPresets();
    expect(presets).toContain('ק"ג');
    expect(presets).toContain('טון');
    expect(presets).toContain('יחידות');
    expect(presets).toContain('ארגזים');
  });
});

describe('isCustomYieldUnit', () => {
  it('treats every preset as not custom', () => {
    for (const preset of yieldUnitPresets()) {
      expect(isCustomYieldUnit(preset)).toBe(false);
    }
  });

  it('treats an unrecognised unit as custom, so it opens under "other"', () => {
    expect(isCustomYieldUnit('שקים')).toBe(true);
    expect(isCustomYieldUnit('מיכלים')).toBe(true);
  });

  it('does not treat an empty or whitespace value as custom', () => {
    expect(isCustomYieldUnit('')).toBe(false);
    expect(isCustomYieldUnit('   ')).toBe(false);
  });

  it('ignores surrounding whitespace when matching a preset', () => {
    expect(isCustomYieldUnit('  טון  ')).toBe(false);
  });
});

describe('expectedPriceDisplay', () => {
  it('pairs the amount with the unit it refers to', () => {
    expect(expectedPriceDisplay(cropCycle(), 'ILS')).toContain('/ ק"ג');
  });

  it('stays grammatical for a plural counted unit', () => {
    const display = expectedPriceDisplay(cropCycle({ yieldUnit: 'יחידות' }), 'ILS');
    expect(display).toContain('/ יחידות');
    expect(display).not.toContain('ליחידות');
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
