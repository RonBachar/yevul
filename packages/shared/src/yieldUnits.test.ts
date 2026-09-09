import { describe, expect, it } from 'vitest';
import {
  forecastSentence,
  forecastUnits,
  parseYieldUnit,
  reconcileYieldUnits,
  yieldUnitFactor,
  yieldUnitLabel,
  yieldUnitText,
  KG_PER_TON,
  YIELD_UNITS,
  type ForecastSentenceInput,
} from './yieldUnits';

// Intl's he-IL currency format inserts RLM marks (U+200F) around the number and
// the symbol and joins them with a non-breaking space. All three are invisible
// on screen and all three would make every expected string below unreadable in
// the source. This drops the direction marks and turns the two flavours of
// non-breaking space into an ordinary one; it touches no digit, no word and no
// separator.
function plain(text: string | null): string | null {
  if (text === null) return null;
  return text.replace(/[\u200E\u200F]/g, '').replace(/[\u00A0\u202F]/g, ' ');
}

function sentenceInput(overrides: Partial<ForecastSentenceInput> = {}): ForecastSentenceInput {
  return {
    area: 8,
    areaUnit: 'dunam',
    expectedYieldPerArea: 3,
    yieldUnit: 'ton',
    expectedPricePerUnit: 4,
    priceUnit: 'kg',
    currency: 'ILS',
    ...overrides,
  };
}

// ============================================================
// Reading the column.
//
// Every row written before 20260909120000 holds free text a farmer picked off a
// preset list or typed himself. The migration rewrites none of it, so the parser
// has to map what maps and hand back the rest untouched.
// ============================================================

describe('parseYieldUnit', () => {
  it('reads the canonical codes that are written from today onwards', () => {
    expect(parseYieldUnit('kg')).toBe('kg');
    expect(parseYieldUnit('ton')).toBe('ton');
    expect(parseYieldUnit('unit')).toBe('unit');
  });

  // The preset list shipped an ASCII quote and a Hebrew keyboard produces
  // gershayim, so both spellings are sitting in the column today.
  it('reads the two spellings of ק"ג that are both in the data', () => {
    expect(parseYieldUnit('ק"ג')).toBe('kg');
    expect(parseYieldUnit('ק״ג')).toBe('kg');
    expect(parseYieldUnit('קילו')).toBe('kg');
  });

  it('reads the old Hebrew presets for the other two units', () => {
    expect(parseYieldUnit('טון')).toBe('ton');
    expect(parseYieldUnit('יחידות')).toBe('unit');
    expect(parseYieldUnit('יחידה')).toBe('unit');
  });

  it('ignores surrounding whitespace and case', () => {
    expect(parseYieldUnit('  טון  ')).toBe('ton');
    expect(parseYieldUnit('  KG ')).toBe('kg');
  });

  // **ארגזים is not יחידות.** A crate is a container whose contents nobody
  // stated, so mapping it onto the count unit would relabel 300 crates as 300
  // pieces -- a change of meaning dressed up as a migration. It stays unmapped
  // and stays readable.
  it('refuses to guess at a unit it does not know', () => {
    expect(parseYieldUnit('ארגזים')).toBeNull();
    expect(parseYieldUnit('שקים')).toBeNull();
    expect(parseYieldUnit('מיכלים')).toBeNull();
  });

  it('treats empty, whitespace and missing alike', () => {
    expect(parseYieldUnit('')).toBeNull();
    expect(parseYieldUnit('   ')).toBeNull();
    expect(parseYieldUnit(null)).toBeNull();
    expect(parseYieldUnit(undefined)).toBeNull();
  });
});

describe('yieldUnitText', () => {
  it('shows a known unit by its Hebrew name', () => {
    expect(yieldUnitText('kg')).toBe('קילו');
    expect(yieldUnitText('ton')).toBe('טון');
    expect(yieldUnitText('unit')).toBe('יחידה');
  });

  it('shows an old Hebrew value by the same name its code would get', () => {
    expect(yieldUnitText('ק"ג')).toBe('קילו');
  });

  // Nothing a farmer typed disappears off his screen because the app narrowed
  // its own list afterwards.
  it("keeps a unit it cannot map exactly as the farmer wrote it", () => {
    expect(yieldUnitText('ארגזים')).toBe('ארגזים');
    expect(yieldUnitText('  שקים  ')).toBe('שקים');
  });

  it('has nothing to show for an empty column', () => {
    expect(yieldUnitText(null)).toBeNull();
    expect(yieldUnitText('  ')).toBeNull();
  });
});

// ============================================================
// The conversion.
// ============================================================

describe('yieldUnitFactor', () => {
  it('is one between a unit and itself', () => {
    for (const unit of YIELD_UNITS) {
      expect(yieldUnitFactor(unit, unit)).toBe(1);
    }
  });

  it('is a thousand kilos to the ton, and its reciprocal back', () => {
    expect(yieldUnitFactor('ton', 'kg')).toBe(KG_PER_TON);
    expect(yieldUnitFactor('kg', 'ton')).toBe(1 / KG_PER_TON);
  });

  it('round-trips a quantity through both directions', () => {
    const tons = 24;
    expect(tons * yieldUnitFactor('ton', 'kg')! * yieldUnitFactor('kg', 'ton')!).toBe(tons);
  });

  // **A count against a weight has no factor, and inventing one is the failure
  // mode this whole file exists to prevent.** Nobody knows what one fruit
  // weighs, so there is no honest number and null is the answer.
  it('refuses to convert a count into a weight, in either direction', () => {
    expect(yieldUnitFactor('unit', 'kg')).toBeNull();
    expect(yieldUnitFactor('unit', 'ton')).toBeNull();
    expect(yieldUnitFactor('kg', 'unit')).toBeNull();
    expect(yieldUnitFactor('ton', 'unit')).toBeNull();
  });
});

// ============================================================
// The יחידה rule.
//
// Rather than let the pair reach the one combination with no answer, picking
// יחידה on either side moves the other side to it too. The pickers call this on
// every change, so the farmer watches both selects move together and never gets
// to a state the app has to refuse.
// ============================================================

describe('reconcileYieldUnits', () => {
  it('pulls the price to a count when the farmer sets the yield to a count', () => {
    expect(reconcileYieldUnits('unit', 'kg', 'yield')).toEqual({
      yieldUnit: 'unit',
      priceUnit: 'unit',
    });
    expect(reconcileYieldUnits('unit', 'ton', 'yield')).toEqual({
      yieldUnit: 'unit',
      priceUnit: 'unit',
    });
  });

  it('pulls the yield to a count when the farmer prices by the count', () => {
    expect(reconcileYieldUnits('ton', 'unit', 'price')).toEqual({
      yieldUnit: 'unit',
      priceUnit: 'unit',
    });
  });

  // **Without the `changed` argument this is where the farmer got stuck.** A
  // plot already on יחידה / יחידה whose price he moves to קילו would have had
  // both snapped back, with no way out of the pair he chose by accident.
  it('lets him leave a counted pair by moving either side to a weight', () => {
    expect(reconcileYieldUnits('unit', 'kg', 'price')).toEqual({
      yieldUnit: 'kg',
      priceUnit: 'kg',
    });
    expect(reconcileYieldUnits('ton', 'unit', 'yield')).toEqual({
      yieldUnit: 'ton',
      priceUnit: 'ton',
    });
  });

  // The whole point of two unit columns: tons per dunam priced by the kilo is
  // the combination Ido actually uses, and it must survive untouched.
  it('leaves any two weights alone, including a mixed pair', () => {
    expect(reconcileYieldUnits('ton', 'kg', 'yield')).toEqual({
      yieldUnit: 'ton',
      priceUnit: 'kg',
    });
    expect(reconcileYieldUnits('ton', 'kg', 'price')).toEqual({
      yieldUnit: 'ton',
      priceUnit: 'kg',
    });
  });

  // A question that has not been answered is not a wrong answer, so nothing is
  // forced onto the side that is still blank.
  it('leaves a pair that is not answered yet alone', () => {
    expect(reconcileYieldUnits(null, null, 'yield')).toEqual({
      yieldUnit: null,
      priceUnit: null,
    });
    expect(reconcileYieldUnits('unit', null, 'yield')).toEqual({
      yieldUnit: 'unit',
      priceUnit: null,
    });
    expect(reconcileYieldUnits(null, 'unit', 'price')).toEqual({
      yieldUnit: null,
      priceUnit: 'unit',
    });
  });

  it('is idempotent, so a picker can call it on every change', () => {
    const once = reconcileYieldUnits('unit', 'kg', 'yield');
    expect(reconcileYieldUnits(once.yieldUnit, once.priceUnit, 'yield')).toEqual(once);
  });

  // Whatever it returns, the pair it returns always has a conversion factor.
  // That is the property the sheet relies on to never offer a save it cannot
  // compute.
  it('never returns a pair that cannot convert', () => {
    for (const y of [...YIELD_UNITS, null]) {
      for (const p of [...YIELD_UNITS, null]) {
        for (const changed of ['yield', 'price'] as const) {
          const result = reconcileYieldUnits(y, p, changed);
          if (result.yieldUnit && result.priceUnit) {
            expect(yieldUnitFactor(result.yieldUnit, result.priceUnit)).not.toBeNull();
          }
        }
      }
    }
  });
});

// ============================================================
// The two columns, resolved together.
// ============================================================

describe('forecastUnits', () => {
  it('reads a tons-per-dunam yield priced by the kilo as a thousandfold', () => {
    expect(forecastUnits('ton', 'kg')).toEqual({
      yieldUnit: 'ton',
      priceUnit: 'kg',
      yieldLabel: 'טון',
      priceLabel: 'קילו',
      factor: KG_PER_TON,
    });
  });

  // **Every row written before price_unit existed multiplied yield by price
  // directly.** Reading a null price unit as "the same unit as the yield"
  // reproduces the number the farmer has been looking at, to the shekel;
  // anything else would silently restate his forecast.
  it('reads a row from before price_unit as priced in the yield unit', () => {
    const units = forecastUnits('ק"ג', null);
    expect(units.factor).toBe(1);
    expect(units.priceUnit).toBe('kg');
    expect(units.priceLabel).toBe('קילו');
  });

  it('does the same for a legacy free-text unit it cannot map', () => {
    const units = forecastUnits('ארגזים', null);
    expect(units.factor).toBe(1);
    expect(units.yieldLabel).toBe('ארגזים');
    expect(units.priceLabel).toBe('ארגזים');
  });

  it('carries the no-conversion answer through for a count against a weight', () => {
    expect(forecastUnits('unit', 'kg').factor).toBeNull();
    expect(forecastUnits('ton', 'unit').factor).toBeNull();
  });

  it('has nothing to label on a crop cycle with no units at all', () => {
    expect(forecastUnits(null, null)).toEqual({
      yieldUnit: null,
      priceUnit: null,
      yieldLabel: null,
      priceLabel: null,
      factor: 1,
    });
  });
});

// ============================================================
// The sentence, and it is the point of the whole exercise.
//
// A total alone cannot be checked -- 96,000 and 96 both look like money. A
// sentence that names every unit on the way is what catches a farmer who means
// 4 per kilo and types 4000 per ton.
// ============================================================

describe('forecastSentence', () => {
  // The founder's own example, word for word.
  it('writes out the arithmetic of tons per dunam at a price per kilo', () => {
    expect(plain(forecastSentence(sentenceInput()))).toBe(
      '8 דונם × 3 טון לדונם = 24 טון. במחיר 4 ₪ לקילו ← צפי הכנסה 96,000 ₪',
    );
  });

  // **The error the sentence exists to catch.** Same farmer, same plot, price
  // typed as 4000 per ton instead of 4 per kilo: the income is identical, and
  // only the middle of the sentence says which one he gave.
  it('reads the same income back for the same price stated the other way', () => {
    const perTon = plain(
      forecastSentence(sentenceInput({ priceUnit: 'ton', expectedPricePerUnit: 4000 })),
    );
    expect(perTon).toBe('8 דונם × 3 טון לדונם = 24 טון. במחיר 4,000 ₪ לטון ← צפי הכנסה 96,000 ₪');
  });

  // And the mistake itself: 4000 left on "per kilo" is a thousand times the
  // money, and the sentence puts that in front of him before he saves.
  it('shows an order-of-magnitude slip as an order-of-magnitude number', () => {
    expect(plain(forecastSentence(sentenceInput({ expectedPricePerUnit: 4000 })))).toContain(
      '96,000,000 ₪',
    );
  });

  it('needs no conversion when both sides are already the same unit', () => {
    expect(
      plain(
        forecastSentence(
          sentenceInput({ yieldUnit: 'kg', priceUnit: 'kg', expectedYieldPerArea: 300 }),
        ),
      ),
    ).toBe('8 דונם × 300 קילו לדונם = 2,400 קילו. במחיר 4 ₪ לקילו ← צפי הכנסה 9,600 ₪');
  });

  // A counted crop reads in the singular throughout, which is why the unit is
  // 'יחידה' and not the 'יחידות' the old preset list stored: it has to work
  // after a number and after ל׳ in the same sentence.
  it('reads naturally for a counted crop', () => {
    expect(
      plain(
        forecastSentence(
          sentenceInput({
            yieldUnit: 'unit',
            priceUnit: 'unit',
            expectedYieldPerArea: 500,
            expectedPricePerUnit: 2,
          }),
        ),
      ),
    ).toBe('8 דונם × 500 יחידה לדונם = 4,000 יחידה. במחיר 2 ₪ ליחידה ← צפי הכנסה 8,000 ₪');
  });

  // A legacy plural keeps the slash the price label has always used, because
  // "לארגזים" is not Hebrew. See perUnitPhrase.
  it('keeps an unmappable legacy unit readable rather than forcing ל onto it', () => {
    const sentence = plain(
      forecastSentence(sentenceInput({ yieldUnit: 'ארגזים', priceUnit: null })),
    );
    expect(sentence).toContain('3 ארגזים לדונם = 24 ארגזים');
    expect(sentence).toContain('4 ₪ / ארגזים');
    expect(sentence).not.toContain('לארגזים');
  });

  // Unreachable through the pickers, which reconcile on every change, but a row
  // written straight into the database can be in this state. Saying so beats
  // printing a product of two things that do not multiply.
  it('says so instead of multiplying a count by a price per kilo', () => {
    expect(forecastSentence(sentenceInput({ yieldUnit: 'unit', priceUnit: 'kg' }))).toBe(
      'יחידת היבול ויחידת המחיר לא ניתנות להמרה זו לזו',
    );
  });

  // Nothing to say is better than half a sentence about a plot the farmer has
  // not finished describing.
  it('stays quiet until there is an area, a yield and a price', () => {
    expect(forecastSentence(sentenceInput({ area: null }))).toBeNull();
    expect(forecastSentence(sentenceInput({ expectedYieldPerArea: null }))).toBeNull();
    expect(forecastSentence(sentenceInput({ expectedPricePerUnit: null }))).toBeNull();
  });

  // A plot with no area unit is an old row the form no longer allows. The
  // sentence drops the word rather than inventing a unit for the number the
  // entire forecast is multiplied by.
  it('never invents an area unit it was not given', () => {
    const sentence = plain(forecastSentence(sentenceInput({ areaUnit: null })));
    expect(sentence).toBe('8 × 3 טון = 24 טון. במחיר 4 ₪ לקילו ← צפי הכנסה 96,000 ₪');
    expect(sentence).not.toContain('דונם');
  });

  it('follows the farm to another currency', () => {
    expect(plain(forecastSentence(sentenceInput({ currency: 'USD' })))).toContain('96,000 $');
  });

  it('names the units in the farm language, not the codes stored in the column', () => {
    const sentence = plain(forecastSentence(sentenceInput()))!;
    expect(sentence).toContain(yieldUnitLabel('ton'));
    expect(sentence).toContain(yieldUnitLabel('kg'));
    expect(sentence).not.toContain('ton');
    expect(sentence).not.toContain('kg');
  });
});
