import { formatAmount, formatNumber, yieldRateUnitLabel } from './format';
import { t } from './i18n';
import { areaUnitLabelKey, type AreaUnit, type Currency } from './settings';

// The three units a yield and a price can be stated in, the conversion between
// them, and the plain-Hebrew sentence that shows a farmer the arithmetic he just
// typed.
//
// ============================================================
// Why this file exists at all.
//
// Ido states a yield in tons per dunam and a price in shekels per kilo. Until
// today the schema had one unit column serving both, so the app multiplied a
// number measured in tons by a price measured in kilos and printed the product
// with a straight face. A farmer who means 4 per kilo and types 4000 per ton
// gets a plausible-looking number either way, and nothing on the screen says
// which one he gave. That is the whole bug, and it has two halves:
//
//   1. the price needs its own unit, so the app can convert instead of assume;
//   2. the farmer needs to SEE the arithmetic, because a wrong order of
//      magnitude is invisible in a total and obvious in a sentence.
//
// Both halves live here, pure and tested, because neither client has a test
// runner and because a conversion factor that drifts between the phone and the
// browser would be worse than not converting at all.
// ============================================================

// **Three, and there is no fourth.** The column is free text in the database and
// stays that way (see 20260909120000), but the product decision narrows what the
// pickers offer to weight-small, weight-large and count. The old preset list also
// carried ארגזים, which is neither: a crate is a container whose contents nobody
// stated, so it can be converted to nothing and priced only against itself.
// Existing rows that hold it are still read and still displayed -- see
// yieldUnitText -- they simply do not resolve to one of these three.
export const YIELD_UNITS = ['kg', 'ton', 'unit'] as const;
export type YieldUnit = (typeof YIELD_UNITS)[number];

// **English codes in the column, Hebrew only on screen.** The stored value used
// to be the translated string itself, which meant the day a second language
// arrives every historic row would read in the wrong one, and the parser below
// would have to know every translation of every unit that ever shipped. A code
// is a code in any language.
const YIELD_UNIT_LABEL_KEYS: Record<YieldUnit, string> = {
  kg: 'plots.unit.kg',
  ton: 'plots.unit.ton',
  unit: 'plots.unit.unit',
};

export function yieldUnitLabelKey(unit: YieldUnit): string {
  return YIELD_UNIT_LABEL_KEYS[unit];
}

// Called at render time and not folded into a module constant, so that the
// language switch planned for stage 8 reaches it.
export function yieldUnitLabel(unit: YieldUnit): string {
  return t(YIELD_UNIT_LABEL_KEYS[unit]);
}

export function isYieldUnit(value: string): value is YieldUnit {
  return (YIELD_UNITS as readonly string[]).includes(value);
}

// One kilo is a kilo and one ton is a thousand of them. The only conversion in
// the product, and it is exact, which is why it is a constant and not a table.
export const KG_PER_TON = 1000;

// ============================================================
// Reading what is already in the column.
//
// Every row written before today holds a Hebrew string a farmer picked off a
// preset list or typed himself: 'ק"ג', 'ק״ג', 'טון', 'יחידות', 'ארגזים', 'שקים'.
// **None of it is rewritten by the migration**, so the read path has to map what
// maps and leave the rest alone. What it must never do is throw, and it must
// never guess: 'ארגזים' is not 'יחידות' -- relabelling 300 crates as 300 units
// changes what the number means, which is the exact class of error this whole
// change exists to stop.
// ============================================================

// Gershayim (U+05F4) and geresh (U+05F3) are what a Hebrew keyboard actually
// produces, while the preset list shipped ASCII quotes, so 'ק"ג' and 'ק״ג' are
// two spellings of one unit that are sitting in the same column today. Stripping
// both, plus spaces and case, is what makes them one key.
function normalizeUnitText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/["'׳״’”.]/g, '')
    .replace(/\s+/g, '');
}

const YIELD_UNIT_ALIASES: Record<string, YieldUnit> = {
  // The canonical codes themselves, which is what everything written from today
  // onwards holds.
  kg: 'kg',
  ton: 'ton',
  unit: 'unit',
  // Weight, small.
  קג: 'kg',
  קילו: 'kg',
  קילוגרם: 'kg',
  קילוגרמים: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  // Weight, large.
  טון: 'ton',
  טונה: 'ton',
  טונות: 'ton',
  tons: 'ton',
  tonne: 'ton',
  // Count. Both the singular the pickers now offer and the plural the old preset
  // list stored.
  יחידה: 'unit',
  יחידות: 'unit',
  יח: 'unit',
  units: 'unit',
};

// null means "this text is not one of the three", which is a real and expected
// answer for a legacy row. It is not an error and nothing downstream treats it
// as one.
export function parseYieldUnit(raw: string | null | undefined): YieldUnit | null {
  if (raw == null) return null;
  const normalized = normalizeUnitText(raw);
  if (normalized === '') return null;
  return YIELD_UNIT_ALIASES[normalized] ?? null;
}

// What to put on screen for a stored value: the Hebrew name of the unit when the
// text resolves, and otherwise the farmer's own words, untouched. null when the
// column is empty, which the display sites already know how to render.
export function yieldUnitText(raw: string | null | undefined): string | null {
  const parsed = parseYieldUnit(raw);
  if (parsed) return yieldUnitLabel(parsed);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

// ============================================================
// The conversion, and the rule about counting.
// ============================================================

// How many `to` there are in one `from`. **null when the two cannot convert at
// all**, which is exactly one case: a count against a weight. Nobody knows what
// a single fruit weighs, the app certainly does not, and inventing a factor
// there would produce a wrong number that looks like a right one.
export function yieldUnitFactor(from: YieldUnit, to: YieldUnit): number | null {
  if (from === to) return 1;
  if (from === 'unit' || to === 'unit') return null;
  return from === 'ton' ? KG_PER_TON : 1 / KG_PER_TON;
}

// The one pair that has no factor: a count on one side and a weight on the
// other. A unit that is not chosen yet conflicts with nothing -- an unanswered
// question is not a wrong answer.
function unitsConflict(a: YieldUnit | null, b: YieldUnit | null): boolean {
  if (a === null || b === null) return false;
  return (a === 'unit') !== (b === 'unit');
}

// **The יחידה rule.** A count cannot be converted to a weight, so rather than
// letting the pair reach the state with no answer, choosing יחידה on either side
// moves the other side to it as well. The pickers call this on every change, so
// the farmer watches both selects move together and never gets to a combination
// the app would have to refuse.
//
// **`changed` is which select the farmer just touched, and it decides which one
// stays put.** Without it the rule traps him: a plot on יחידה / יחידה whose price
// he moves to קילו would have both snapped straight back to יחידה, and he could
// never leave. The side he touched is the answer he just gave; the other side is
// the one that follows him.
export function reconcileYieldUnits(
  yieldUnit: YieldUnit | null,
  priceUnit: YieldUnit | null,
  changed: 'yield' | 'price',
): { yieldUnit: YieldUnit | null; priceUnit: YieldUnit | null } {
  if (!unitsConflict(yieldUnit, priceUnit)) return { yieldUnit, priceUnit };
  return changed === 'yield'
    ? { yieldUnit, priceUnit: yieldUnit }
    : { yieldUnit: priceUnit, priceUnit };
}

// ============================================================
// The two stored strings, resolved together.
// ============================================================

export type ForecastUnits = {
  // The canonical units, null when the stored text is not one of the three.
  yieldUnit: YieldUnit | null;
  priceUnit: YieldUnit | null;
  // What to show for each. The Hebrew name when it resolves, the farmer's own
  // text when it does not, null when the column is empty.
  yieldLabel: string | null;
  priceLabel: string | null;
  // Multiply a quantity measured in the yield unit by this to get it in the
  // price unit. **null means the two cannot convert**, and every caller must
  // treat that as "no income to show" rather than falling back to 1.
  factor: number | null;
};

// **A null price unit means "the same unit as the yield", and that is not a
// default, it is what those rows were saved under.** Every row written before
// price_unit existed multiplied yield by price directly, so reading them with a
// factor of 1 reproduces the number the farmer has been looking at, to the
// shekel. Anything else would silently restate his forecast.
export function forecastUnits(
  yieldUnitRaw: string | null | undefined,
  priceUnitRaw: string | null | undefined,
): ForecastUnits {
  const yieldUnit = parseYieldUnit(yieldUnitRaw);
  const parsedPrice = parseYieldUnit(priceUnitRaw);
  const priceGiven = (priceUnitRaw?.trim() ?? '') !== '';
  const priceUnit = priceGiven ? parsedPrice : yieldUnit;

  const yieldLabel = yieldUnitText(yieldUnitRaw);
  const priceLabel = priceGiven ? yieldUnitText(priceUnitRaw) : yieldLabel;

  // Both sides resolved: the real conversion, including the null that a count
  // against a weight produces. Either side unresolved: the two are free text
  // that can only ever have referred to one and the same thing, which is the
  // legacy arithmetic and a factor of 1.
  const factor = yieldUnit != null && priceUnit != null ? yieldUnitFactor(yieldUnit, priceUnit) : 1;

  return { yieldUnit, priceUnit, yieldLabel, priceLabel, factor };
}

// ============================================================
// The safety net: the arithmetic, written out.
//
// "8 דונם × 3 טון לדונם = 24 טון. במחיר 4 ₪ לקילו ← צפי הכנסה 96,000 ₪"
//
// **This is the single most important thing on the forecast sheet.** A total
// alone cannot be checked -- 96,000 and 96 both look like money -- while a
// sentence that names every unit on the way makes a farmer who meant 4 per kilo
// and typed 4000 per ton see it before he saves. It renders live, under the
// fields, from what is being typed rather than from what is stored.
// ============================================================

export type ForecastSentenceInput = {
  area: number | null;
  areaUnit: AreaUnit | null;
  expectedYieldPerArea: number | null;
  yieldUnit: string | null;
  expectedPricePerUnit: number | null;
  priceUnit: string | null;
  currency: Currency;
};

// ל׳ before a unit is safe now in a way it was not before: the three units are
// singular nouns ("לקילו", "לטון", "ליחידה"). A legacy plural that never
// resolved ("ארגזים") keeps the slash form the price label has always used, for
// the same reason priceUnitLabel picked it -- "לארגזים" is not Hebrew.
function perUnitPhrase(label: string, canonical: YieldUnit | null): string {
  return canonical ? `${t('plots.forecast.per')}${label}` : `/ ${label}`;
}

// null when there is nothing to say: no area, no yield or no price means there
// is no arithmetic yet, and a half-sentence about a plot the farmer has not
// finished describing is noise. The one non-null non-sentence is the mismatch
// case below, which is a thing he needs told.
export function forecastSentence(input: ForecastSentenceInput): string | null {
  const { area, areaUnit, expectedYieldPerArea, expectedPricePerUnit, currency } = input;
  if (area == null || expectedYieldPerArea == null || expectedPricePerUnit == null) return null;

  const units = forecastUnits(input.yieldUnit, input.priceUnit);

  // A count priced by weight, or the reverse. Unreachable through the pickers,
  // which apply reconcileYieldUnits on every change, but reachable by a row
  // written straight into the database -- and the honest answer is to say so
  // rather than print a product of two things that do not multiply.
  if (units.factor == null) return t('plots.forecast.unitMismatch');

  const totalYield = area * expectedYieldPerArea;
  const income = totalYield * units.factor * expectedPricePerUnit;

  // areaUnit is null only when the plot never got one, which the plot form does
  // not allow but an old row can be in. The sentence drops the word rather than
  // inventing a unit for a number the whole forecast is multiplied by.
  const areaText = areaUnit
    ? `${formatNumber(area)} ${t(areaUnitLabelKey(areaUnit))}`
    : formatNumber(area);
  const rateText = areaUnit
    ? `${formatNumber(expectedYieldPerArea)} ${yieldRateUnitLabel(units.yieldLabel, areaUnit)}`
    : [formatNumber(expectedYieldPerArea), units.yieldLabel].filter(Boolean).join(' ');
  const totalText = [formatNumber(totalYield), units.yieldLabel].filter(Boolean).join(' ');
  const priceText = units.priceLabel
    ? `${formatAmount(expectedPricePerUnit, currency)} ${perUnitPhrase(units.priceLabel, units.priceUnit)}`
    : formatAmount(expectedPricePerUnit, currency);

  return (
    `${areaText} × ${rateText} = ${totalText}. ` +
    `${t('plots.forecast.atPrice')} ${priceText} ← ` +
    `${t('plots.profit.income')} ${formatAmount(income, currency)}`
  );
}
