import { describe, expect, it } from 'vitest';
import {
  currencySymbol,
  formatSignedAmount,
  priceUnitLabel,
  profitTone,
  scaledAmountFontSize,
  yieldRateUnitLabel,
} from './format';

// התוויות האלה קיימות כדי לפרק בלבול אמיתי שנתפס בבדיקה על מכשיר:
// שתי התוויות הישנות בגיליון עדכון הצפי השתמשו במילה "יחידה" בשתי
// משמעויות שונות, יחידת שטח בשדה אחד ויחידת יבול בשני. הבדיקות כאן
// מקבעות שהיחידות האמיתיות מורכבות נכון ושאף אחת מהן לא נופלת בשקט
// חזרה למילה המופשטת כשיש נתונים.
describe('yieldRateUnitLabel', () => {
  it('combines the yield unit with the plot area unit', () => {
    expect(yieldRateUnitLabel('ק"ג', 'dunam')).toBe('ק"ג לדונם');
  });

  it('uses the real area unit, not a hardcoded dunam', () => {
    expect(yieldRateUnitLabel('טון', 'hectare')).toBe('טון להקטאר');
  });

  // עידו, בדיקת שדה: חלק מהגידולים נספרים ולא נשקלים. כאן ל׳ נצמדת
  // ליחידת השטח ולא ליחידת היבול, ולכן כל צורה עובדת, יחיד או רבים.
  it('reads correctly for count-based units, singular or plural', () => {
    expect(yieldRateUnitLabel('יחידות', 'dunam')).toBe('יחידות לדונם');
    expect(yieldRateUnitLabel('ארגזים', 'dunam')).toBe('ארגזים לדונם');
    expect(yieldRateUnitLabel('שקים', 'dunam')).toBe('שקים לדונם');
  });

  it('omits the unit entirely when unset, never inventing one', () => {
    expect(yieldRateUnitLabel(null, 'dunam')).toBe('לדונם');
  });

  it('treats a whitespace-only yield unit as unset', () => {
    expect(yieldRateUnitLabel('   ', 'dunam')).toBe('לדונם');
  });

  it('trims a padded yield unit rather than rendering the padding', () => {
    expect(yieldRateUnitLabel('  ארגז  ', 'dunam')).toBe('ארגז לדונם');
  });
});

describe('priceUnitLabel', () => {
  it('pairs the currency symbol with the yield unit, not the area unit', () => {
    expect(priceUnitLabel('ק"ג', 'ILS')).toBe('₪ / ק"ג');
  });

  it('follows the selected currency', () => {
    expect(priceUnitLabel('טון', 'USD')).toBe('$ / טון');
  });

  // זה המקרה ש-ל׳ שברה: "₪ ליחידות" ו-"₪ לארגזים" שגויים דקדוקית, כי
  // אחרי ל׳ היחידה חייבת להיות ביחיד. הלוכסן חסין לצורה שהוקלדה.
  it('stays grammatical for plural count-based units', () => {
    expect(priceUnitLabel('יחידות', 'ILS')).toBe('₪ / יחידות');
    expect(priceUnitLabel('ארגזים', 'ILS')).toBe('₪ / ארגזים');
    expect(priceUnitLabel('שקים', 'ILS')).toBe('₪ / שקים');
  });

  it('never emits the broken lamed form for any unit', () => {
    for (const unit of ['ק"ג', 'טון', 'יחידות', 'ארגזים', 'שקים', 'יחידה']) {
      expect(priceUnitLabel(unit, 'ILS')).not.toContain('₪ ל');
    }
  });

  it('shows the bare currency symbol when the yield unit is unset', () => {
    expect(priceUnitLabel(null, 'ILS')).toBe('₪');
  });
});

// design.md: לעולם לא צבע לבדו על מספר רווח/הפסד, תמיד גם סימן וגם
// חץ. הסימן הוא חלק מהפורמט, ולכן הוא נבדק כאן ולא נשען על המסך.
describe('formatSignedAmount', () => {
  it('marks a gain with an explicit plus', () => {
    expect(formatSignedAmount(312000, 'ILS')).toContain('+');
  });

  // **מקף ASCII ולא מינוס טיפוגרפי, והבדיקה נועלת בדיוק את זה.**
  // הגרסה הקודמת דרשה U+2212, וזה היה נכון כל עוד הפונט היה OedooPro.
  // ל-Alef, שהחליפה אותה, אין את הגליף הזה כלל, ולכן כל מספר שלילי
  // היה מרונדר עם תו שנלקח מפונט מערכת אחר בתוך סכום כספי.
  it('marks a loss with a sign the font actually has', () => {
    const formatted = formatSignedAmount(-45000, 'ILS');
    expect(formatted).toContain('-');
    expect(formatted).not.toContain('−');
  });

  it('leaves zero unsigned, since zero is neither gain nor loss', () => {
    const formatted = formatSignedAmount(0, 'ILS');
    expect(formatted).not.toContain('+');
    expect(formatted).not.toContain('-');
  });

  it('never renders a doubled sign from the formatter itself', () => {
    expect(formatSignedAmount(-45000, 'ILS')).not.toContain('−−');
  });
});

describe('profitTone', () => {
  it('classifies gain, loss and zero separately', () => {
    expect(profitTone(1)).toBe('profit');
    expect(profitTone(-1)).toBe('loss');
    expect(profitTone(0)).toBe('zero');
  });
});

describe('currencySymbol', () => {
  it('returns the symbol alone, with no digits', () => {
    expect(currencySymbol('ILS')).toBe('₪');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
  });
});

// הכרטיס מציג את הסכום ב-heading-lg (60), ואין תקרה לגודלו. מ-7 ספרות
// ומעלה הטקסט חצה את גבול הכרטיס לפני התיקון.
describe('scaledAmountFontSize', () => {
  it('keeps the base size for a short amount', () => {
    expect(scaledAmountFontSize('‏45,000 ₪', 60, 34)).toBe(60);
  });

  it('shrinks as the formatted string grows', () => {
    const short = scaledAmountFontSize('‏45,000 ₪', 60, 34);
    const long = scaledAmountFontSize('‏1,234,567 ₪', 60, 34);
    expect(long).toBeLessThan(short);
  });

  it('never drops below the floor, however long the number', () => {
    expect(scaledAmountFontSize('‏123,456,789,012,345 ₪', 60, 34)).toBe(34);
  });
});
