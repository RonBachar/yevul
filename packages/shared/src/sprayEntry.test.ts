import { describe, expect, it } from 'vitest';
import { createLogEntry, type LogEntry } from './logEntries';
import { t } from './i18n';
import { safeHarvestDate } from './safeHarvestDate';
import {
  applySprayCost,
  applySprayMaterial,
  applySprayQuantity,
  applySprayUnit,
  applySprayUnitPrice,
  computeSprayCost,
  newSprayDraft,
  nextSprayStep,
  normalizeSprayMaterial,
  parseSprayAmountInput,
  parseSprayPhiDaysInput,
  previousSprayStep,
  recentValues,
  sprayDateOptions,
  sprayDoseOptions,
  sprayDraftFromEntry,
  sprayEntryBlocker,
  sprayEntryInput,
  sprayMaterialChoices,
  sprayMaterialMemory,
  sprayMaterialOptions,
  sprayPestOptions,
  sprayPhiOptions,
  sprayPlotOptions,
  sprayPriceMemory,
  sprayPricelistRows,
  sprayStepFieldKey,
  sprayStepPosition,
  sprayStepRequired,
  sprayStepTitleKey,
  sprayVisibleSteps,
  SPRAY_PHI_PRESET_DAYS,
  SPRAY_PHI_TILE_LIMIT,
  SPRAY_STEPS,
  SPRAY_TILE_LIMIT,
  type SprayHistoryRow,
  type SprayPriceRow,
} from './sprayEntry';

// Newest first, which is the order useSpraySuggestions asks the database for
// and the order every "most recent wins" rule below depends on.
function row(overrides: Partial<SprayHistoryRow> = {}): SprayHistoryRow {
  return { pest: null, material: null, dose: null, phiDays: null, ...overrides };
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    farmId: 'farm-1',
    plotId: 'plot-1',
    date: '2026-08-25',
    type: 'spray',
    note: null,
    source: 'manual',
    sprayPest: 'כנימה',
    sprayMaterial: 'קונפידור',
    sprayDose: '50 סמ"ק',
    sprayPhiDays: 14,
    sprayQuantity: null,
    sprayQuantityUnit: null,
    sprayUnitPrice: null,
    sprayCost: null,
    harvestQty: null,
    harvestUnit: null,
    createdAt: '2026-08-25T06:00:00.000Z',
    ...overrides,
  };
}

// ============================================================
// The lists the grids are built from
// ============================================================

describe('recentValues', () => {
  it('keeps the newest of a repeated value and drops the rest', () => {
    expect(recentValues(['כנימה', 'עש', 'כנימה'], 6)).toEqual(['כנימה', 'עש']);
  });

  it('trims, and treats a blank or whitespace-only value as absent', () => {
    expect(recentValues(['  כנימה  ', '', '   ', null], 6)).toEqual(['כנימה']);
  });

  it('stops at the limit, so an old value cannot push a recent one off screen', () => {
    expect(recentValues(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
  });
});

describe('sprayPestOptions and sprayMaterialOptions', () => {
  it('offer what this farm sprayed, newest first, with no duplicates', () => {
    const rows = [
      row({ pest: 'עש', material: 'ביומקטין' }),
      row({ pest: 'כנימה', material: 'קונפידור' }),
      row({ pest: 'עש', material: 'ביומקטין' }),
    ];
    expect(sprayPestOptions(rows)).toEqual(['עש', 'כנימה']);
    expect(sprayMaterialOptions(rows)).toEqual(['ביומקטין', 'קונפידור']);
  });

  // The first-run answer. An empty grid is a real state and the sheet answers
  // it with an "add a new one" tile and a sentence, not with a dead end.
  it('are empty for a farm that has never sprayed, rather than seeded with guesses', () => {
    expect(sprayPestOptions([])).toEqual([]);
    expect(sprayMaterialOptions([])).toEqual([]);
  });

  it('fill at most one screen', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row({ pest: `pest-${index}` }));
    expect(sprayPestOptions(rows)).toHaveLength(SPRAY_TILE_LIMIT);
  });
});

// A dose belongs to the can, so the doses used with this material come first.
describe('sprayDoseOptions', () => {
  const rows = [
    row({ material: 'ביומקטין', dose: '1%' }),
    row({ material: 'קונפידור', dose: '50 סמ"ק' }),
    row({ material: 'ביומקטין', dose: '0.5%' }),
    row({ material: 'קונפידור', dose: '40 סמ"ק' }),
  ];

  it("puts this material's own doses ahead of the farm's others", () => {
    expect(sprayDoseOptions(rows, 'קונפידור')).toEqual(['50 סמ"ק', '40 סמ"ק', '1%', '0.5%']);
  });

  // Filtering to the material would have left a first-ever use of a material
  // staring at an empty grid it did not have to have.
  it("still offers the farm's other doses for a material never used before", () => {
    expect(sprayDoseOptions(rows, 'עלסר')).toEqual(['1%', '50 סמ"ק', '0.5%', '40 סמ"ק']);
  });

  it('offers nothing at all before the farm has recorded a dose', () => {
    expect(sprayDoseOptions([], 'קונפידור')).toEqual([]);
  });
});

describe('sprayPhiOptions', () => {
  it("puts this material's own waiting periods first, then the farm's, then the ladder", () => {
    const rows = [
      row({ material: 'ביומקטין', phiDays: 10 }),
      row({ material: 'קונפידור', phiDays: 21 }),
    ];
    expect(sprayPhiOptions(rows, 'קונפידור')).toEqual([21, 10, 3, 7]);
  });

  // The one field where a preset is honest: it is a whole number of days off a
  // printed label, and the same handful covers most of them.
  it('is the label ladder alone for a farm with no history', () => {
    expect(sprayPhiOptions([], null)).toEqual([...SPRAY_PHI_PRESET_DAYS]);
  });

  it('never repeats a value the farm already used just because the ladder has it', () => {
    const rows = [row({ material: 'קונפידור', phiDays: 7 })];
    expect(sprayPhiOptions(rows, 'קונפידור')).toEqual([7, 3, 14, 21]);
  });

  it('truncates to whole days and drops a negative one', () => {
    const rows = [row({ material: 'x', phiDays: 14.7 }), row({ material: 'x', phiDays: -1 })];
    expect(sprayPhiOptions(rows, 'x')).toEqual([14, 3, 7, 21]);
  });

  it('stays inside its own limit, which is smaller because this grid has two extra tiles', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row({ phiDays: index + 30 }));
    expect(sprayPhiOptions(rows, null)).toHaveLength(SPRAY_PHI_TILE_LIMIT);
  });
});

// ============================================================
// What the farm remembers about a material
// ============================================================

describe('sprayMaterialMemory', () => {
  it('takes the most recent dose and waiting period used with that material', () => {
    const rows = [
      row({ material: 'קונפידור', dose: '50 סמ"ק', phiDays: 14 }),
      row({ material: 'קונפידור', dose: '40 סמ"ק', phiDays: 21 }),
    ];
    expect(sprayMaterialMemory(rows, 'קונפידור')).toEqual({ dose: '50 סמ"ק', phiDays: 14 });
  });

  // The newest row may state one and not the other. Taking both from a single
  // row would throw away a value the farm actually has.
  it('answers the two halves independently, from whichever row states each', () => {
    const rows = [
      row({ material: 'קונפידור', dose: '50 סמ"ק', phiDays: null }),
      row({ material: 'קונפידור', dose: null, phiDays: 21 }),
    ];
    expect(sprayMaterialMemory(rows, 'קונפידור')).toEqual({ dose: '50 סמ"ק', phiDays: 21 });
  });

  it('knows nothing about a material this farm has not used', () => {
    const rows = [row({ material: 'קונפידור', dose: '50 סמ"ק', phiDays: 14 })];
    expect(sprayMaterialMemory(rows, 'עלסר')).toEqual({ dose: null, phiDays: null });
    expect(sprayMaterialMemory(rows, null)).toEqual({ dose: null, phiDays: null });
  });
});

// ============================================================
// Plots and dates
// ============================================================

describe('sprayPlotOptions', () => {
  it('offers every plot and puts the whole-farm tile last', () => {
    expect(sprayPlotOptions([{ id: 'p1', name: 'הדרומית' }])).toEqual([
      { plotId: 'p1', name: 'הדרומית' },
      { plotId: null, name: null },
    ]);
  });

  // log_entries.plot_id is nullable, so this is a real answer rather than a
  // fallback for an empty list.
  it('offers the whole-farm tile even when the farm has no plots yet', () => {
    expect(sprayPlotOptions([])).toEqual([{ plotId: null, name: null }]);
  });
});

describe('sprayDateOptions', () => {
  it('offers today, yesterday and the day before, read off the local calendar', () => {
    expect(sprayDateOptions(new Date(2026, 8, 3, 9, 30))).toEqual([
      { date: '2026-09-03', labelKey: 'date.today' },
      { date: '2026-09-02', labelKey: 'date.yesterday' },
      { date: '2026-09-01', labelKey: 'date.dayBefore' },
    ]);
  });

  // The bug this repo already shipped once: a local midnight read through
  // toISOString is the previous day in Israel, and a spray date one day early
  // makes safeHarvestDate clear a plot for harvest a day before it is safe.
  it('gives the day the farmer is standing in, not the UTC one, late in the evening', () => {
    expect(sprayDateOptions(new Date(2026, 8, 3, 23, 45))[0]).toEqual({
      date: '2026-09-03',
      labelKey: 'date.today',
    });
  });

  it('walks back over a month boundary correctly', () => {
    expect(sprayDateOptions(new Date(2026, 8, 1)).map((option) => option.date)).toEqual([
      '2026-09-01',
      '2026-08-31',
      '2026-08-30',
    ]);
  });
});

// ============================================================
// The walk
// ============================================================

describe('the steps', () => {
  it('asks the fields in order, cost right after material, then the review', () => {
    expect(SPRAY_STEPS).toEqual([
      'pest',
      'material',
      'cost',
      'dose',
      'phiDays',
      'plot',
      'date',
      'review',
    ]);
  });

  it('gives every step a distinct question and a distinct field label', () => {
    expect(new Set(SPRAY_STEPS.map(sprayStepTitleKey)).size).toBe(SPRAY_STEPS.length);
    expect(new Set(SPRAY_STEPS.map(sprayStepFieldKey)).size).toBe(SPRAY_STEPS.length);
  });

  // Required means createLogEntry refuses without it, and nothing else. The
  // test below holds that claim against the write itself.
  it('marks pest and material required, and nothing else', () => {
    expect(SPRAY_STEPS.filter(sprayStepRequired)).toEqual(['pest', 'material']);
  });
});

describe('newSprayDraft', () => {
  it('starts empty, on today, with every step still to ask', () => {
    const draft = newSprayDraft(new Date(2026, 8, 3), null);
    expect(draft).toEqual({
      pest: null,
      material: null,
      dose: null,
      phiDays: null,
      quantity: null,
      quantityUnit: null,
      unitPrice: null,
      cost: null,
      costEdited: false,
      plotId: null,
      date: '2026-09-03',
      prefilled: [],
    });
    expect(sprayVisibleSteps(draft)).toEqual(SPRAY_STEPS);
  });

  // A farmer who filtered the spray log to a plot and then pressed "new spray"
  // has already answered "which plot". docs/open-items.md calls asking again
  // "too many clicks", and this is one of the clicks.
  it('treats a plot the screen already knew as answered, and drops that step', () => {
    const draft = newSprayDraft(new Date(2026, 8, 3), 'plot-1');
    expect(draft.plotId).toBe('plot-1');
    expect(sprayVisibleSteps(draft)).not.toContain('plot');
    expect(nextSprayStep('date', draft)).toBe('review');
  });
});

describe('applySprayMaterial', () => {
  const rows = [row({ material: 'קונפידור', dose: '50 סמ"ק', phiDays: 14 })];

  // The whole point of the history grid paying twice: the more he uses the app,
  // the shorter the walk gets.
  it('fills the dose and the waiting period from the last time, and skips both steps', () => {
    const draft = applySprayMaterial(newSprayDraft(new Date(2026, 8, 3), null), 'קונפידור', rows);
    expect(draft.dose).toBe('50 סמ"ק');
    expect(draft.phiDays).toBe(14);
    // cost is never skipped, so it is what comes after material even when the
    // dose and the waiting period are remembered.
    expect(nextSprayStep('material', draft)).toBe('cost');
    expect(sprayVisibleSteps(draft)).toEqual([
      'pest',
      'material',
      'cost',
      'plot',
      'date',
      'review',
    ]);
  });

  it('asks for both when the farm has never used this material', () => {
    const draft = applySprayMaterial(newSprayDraft(new Date(2026, 8, 3), null), 'עלסר', rows);
    expect(draft.dose).toBeNull();
    expect(draft.phiDays).toBeNull();
    expect(nextSprayStep('cost', draft)).toBe('dose');
    expect(sprayVisibleSteps(draft)).toContain('dose');
  });

  it('skips only the half it remembers', () => {
    const partial = [row({ material: 'עלסר', dose: '1%', phiDays: null })];
    const draft = applySprayMaterial(newSprayDraft(new Date(2026, 8, 3), null), 'עלסר', partial);
    expect(nextSprayStep('cost', draft)).toBe('phiDays');
    expect(sprayVisibleSteps(draft)).not.toContain('dose');
  });

  // **The dose belongs to the material.** Carrying one across a change of
  // material would write a strength that was never used with it.
  it('re-decides a dose already chosen when the material is changed', () => {
    const first = applySprayMaterial(newSprayDraft(new Date(2026, 8, 3), null), 'קונפידור', rows);
    const second = applySprayMaterial(first, 'עלסר', rows);
    expect(second.dose).toBeNull();
    expect(second.phiDays).toBeNull();
    expect(sprayVisibleSteps(second)).toContain('dose');
  });
});

describe('moving between steps', () => {
  const draft = newSprayDraft(new Date(2026, 8, 3), null);

  it('walks the questions in order and ends on the review', () => {
    expect(nextSprayStep('pest', draft)).toBe('material');
    expect(nextSprayStep('material', draft)).toBe('cost');
    expect(nextSprayStep('cost', draft)).toBe('dose');
    expect(nextSprayStep('dose', draft)).toBe('phiDays');
    expect(nextSprayStep('phiDays', draft)).toBe('plot');
    expect(nextSprayStep('plot', draft)).toBe('date');
    expect(nextSprayStep('date', draft)).toBe('review');
    expect(nextSprayStep('review', draft)).toBe('review');
  });

  it('walks back the same way, and stops at the first question', () => {
    expect(previousSprayStep('material', draft)).toBe('pest');
    expect(previousSprayStep('pest', draft)).toBeNull();
  });

  // A step reached by tapping its tile on the review, which the walk itself
  // does not include, has nowhere to go but back to the review.
  it('sends a skipped step back to the review rather than into the middle of the walk', () => {
    const withPlot = newSprayDraft(new Date(2026, 8, 3), 'plot-1');
    expect(nextSprayStep('plot', withPlot)).toBe('review');
    expect(previousSprayStep('plot', withPlot)).toBeNull();
  });

  it('counts the steps that will actually be asked, not the ones that exist', () => {
    expect(sprayStepPosition('pest', draft)).toEqual({ index: 1, total: 8 });
    const shorter = newSprayDraft(new Date(2026, 8, 3), 'plot-1');
    expect(sprayStepPosition('date', shorter)).toEqual({ index: 6, total: 7 });
  });
});

// ============================================================
// What gets written
// ============================================================

describe('sprayEntryBlocker', () => {
  it('names the pest first, then the material', () => {
    const draft = newSprayDraft(new Date(2026, 8, 3), null);
    expect(sprayEntryBlocker(draft)).toBe('pestRequired');
    expect(sprayEntryBlocker({ ...draft, pest: 'כנימה' })).toBe('materialRequired');
    expect(sprayEntryBlocker({ ...draft, pest: 'כנימה', material: 'קונפידור' })).toBeNull();
  });

  it('does not accept whitespace as an answer', () => {
    const draft = { ...newSprayDraft(new Date(2026, 8, 3), null), pest: '   ' };
    expect(sprayEntryBlocker(draft)).toBe('pestRequired');
  });

  it('lets a spray through with no dose, no waiting period and no plot', () => {
    const draft = {
      ...newSprayDraft(new Date(2026, 8, 3), null),
      pest: 'כנימה',
      material: 'קונפידור',
    };
    expect(sprayEntryBlocker(draft)).toBeNull();
  });

  // **The rule is asked before the save button, and the write asks it again.**
  // The two are separate functions on purpose (see the header), so this holds
  // them to the same answer -- a blocker that let something through which
  // createLogEntry then refused would put a database error in front of a farmer
  // on a screen with no field to fix it.
  it('agrees with what createLogEntry itself refuses', async () => {
    const draft = { ...newSprayDraft(new Date(2026, 8, 3), null), pest: 'כנימה' };
    expect(sprayEntryBlocker(draft)).toBe('materialRequired');

    const supabase = {
      from: () => {
        throw new Error('the write must be refused before it reaches the database');
      },
    } as never;
    const result = await createLogEntry(supabase, 'farm-1', sprayEntryInput(draft));
    expect(result).toEqual({ ok: false, reason: 'materialRequired' });
  });
});

describe('sprayEntryInput', () => {
  const draft = {
    ...newSprayDraft(new Date(2026, 8, 3), 'plot-1'),
    pest: 'כנימה',
    material: 'קונפידור',
    dose: '50 סמ"ק',
    phiDays: 14,
  };

  // Nothing about entering a spray as tiles may change what is stored. These
  // four are the record a regulator is shown.
  it('carries pest, material, dose and waiting period through exactly', () => {
    expect(sprayEntryInput(draft)).toEqual({
      plotId: 'plot-1',
      date: '2026-09-03',
      type: 'spray',
      note: null,
      sprayPest: 'כנימה',
      sprayMaterial: 'קונפידור',
      sprayDose: '50 סמ"ק',
      sprayPhiDays: 14,
      sprayQuantity: null,
      sprayQuantityUnit: null,
      sprayUnitPrice: null,
      sprayCost: null,
      harvestQty: null,
      harvestUnit: null,
    });
  });

  it('always writes a spray, whatever else is on the draft', () => {
    expect(sprayEntryInput(newSprayDraft(new Date(2026, 8, 3), null)).type).toBe('spray');
  });

  it('trims what the farmer typed into the one free-text box this flow shows', () => {
    const typed = { ...draft, pest: '  כנימה  ', material: ' קונפידור ', dose: '  1%  ' };
    const input = sprayEntryInput(typed);
    expect(input.sprayPest).toBe('כנימה');
    expect(input.sprayMaterial).toBe('קונפידור');
    expect(input.sprayDose).toBe('1%');
  });

  it('writes no dose and no waiting period as null rather than as empty text', () => {
    const bare = { ...draft, dose: null, phiDays: null };
    expect(sprayEntryInput(bare).sprayDose).toBeNull();
    expect(sprayEntryInput(bare).sprayPhiDays).toBeNull();
  });

  // The regulatory calculation, end to end from the tiles that produced it.
  it('produces a date and a waiting period safeHarvestDate can read', () => {
    const input = sprayEntryInput(draft);
    expect(safeHarvestDate(input.date, input.sprayPhiDays)).toBe('2026-09-17');
  });
});

describe('sprayDraftFromEntry', () => {
  it('opens an existing spray on all of its own values', () => {
    expect(sprayDraftFromEntry(entry())).toEqual({
      pest: 'כנימה',
      material: 'קונפידור',
      dose: '50 סמ"ק',
      phiDays: 14,
      quantity: null,
      quantityUnit: null,
      unitPrice: null,
      cost: null,
      costEdited: false,
      plotId: 'plot-1',
      date: '2026-08-25',
      prefilled: [],
    });
  });

  // A saved cost that equals quantity x unit price was computed and may still
  // recompute; anything else was typed and must be left alone.
  it('marks a saved cost as edited only when it is not the quantity x price', () => {
    const computed = sprayDraftFromEntry(
      entry({ sprayQuantity: 3, sprayQuantityUnit: 'kg', sprayUnitPrice: 40, sprayCost: 120 }),
    );
    expect(computed.costEdited).toBe(false);
    const typed = sprayDraftFromEntry(
      entry({ sprayQuantity: 3, sprayQuantityUnit: 'kg', sprayUnitPrice: 40, sprayCost: 200 }),
    );
    expect(typed.costEdited).toBe(true);
  });

  // A YYYY-MM-DD string put through a Date and back is the day-early bug from
  // the top of this file, on the one column where it changes a regulatory
  // answer. It is passed through untouched.
  it('keeps the stored date exactly as stored, and round-trips it unchanged', () => {
    expect(sprayEntryInput(sprayDraftFromEntry(entry({ date: '2026-01-01' }))).date).toBe(
      '2026-01-01',
    );
  });
});

describe('parseSprayPhiDaysInput', () => {
  it('reads a number of days', () => {
    expect(parseSprayPhiDaysInput('14')).toBe(14);
    expect(parseSprayPhiDaysInput(' 7 ')).toBe(7);
  });

  // An empty box is a spray with no stated waiting period, which is a real
  // record. An unreadable box is not, and must not quietly become one -- the
  // same distinction parseVoicePhiDaysInput was written for after that exact
  // bug on this exact field.
  it('tells an empty box apart from an unreadable one', () => {
    expect(parseSprayPhiDaysInput('')).toBeNull();
    expect(parseSprayPhiDaysInput('   ')).toBeNull();
    expect(parseSprayPhiDaysInput('בערך שבוע')).toBeUndefined();
    expect(parseSprayPhiDaysInput('-3')).toBeUndefined();
  });

  it('accepts a same-day material as zero days rather than as no answer', () => {
    expect(parseSprayPhiDaysInput('0')).toBe(0);
  });
});

// ============================================================
// The cost: quantity, unit and a remembered price, and the rule that the
// farmer's own number always wins. A price is a default, never a cage.
// ============================================================

describe('normalizeSprayMaterial', () => {
  it('folds spacing and case so two spellings share one price', () => {
    expect(normalizeSprayMaterial('  קונפידור  ')).toBe('קונפידור');
    expect(normalizeSprayMaterial('Confidor  Extra')).toBe('confidor extra');
  });
});

describe('computeSprayCost', () => {
  it('multiplies quantity by unit price', () => {
    expect(computeSprayCost(3, 40)).toBe(120);
  });

  it('is null when either side is missing, so a cost is never invented', () => {
    expect(computeSprayCost(null, 40)).toBeNull();
    expect(computeSprayCost(3, null)).toBeNull();
    expect(computeSprayCost(null, null)).toBeNull();
  });

  it('refuses a negative or unreadable input rather than a wrong number', () => {
    expect(computeSprayCost(-1, 40)).toBeNull();
    expect(computeSprayCost(3, Number.NaN)).toBeNull();
  });
});

describe('parseSprayAmountInput', () => {
  it('reads a quantity or a price, and allows a decimal', () => {
    expect(parseSprayAmountInput('3')).toBe(3);
    expect(parseSprayAmountInput(' 2.5 ')).toBe(2.5);
  });

  it('tells an empty box apart from an unreadable one', () => {
    expect(parseSprayAmountInput('')).toBeNull();
    expect(parseSprayAmountInput('הרבה')).toBeUndefined();
    expect(parseSprayAmountInput('-5')).toBeUndefined();
  });
});

describe('sprayPriceMemory', () => {
  const prices: SprayPriceRow[] = [
    { materialNormalized: 'קונפידור', unitPrice: 40, unit: 'kg' },
    { materialNormalized: 'שמן', unitPrice: 12, unit: 'liter' },
  ];

  it('returns the remembered price and unit for a material', () => {
    expect(sprayPriceMemory(prices, 'קונפידור')).toEqual({ unitPrice: 40, unit: 'kg' });
    expect(sprayPriceMemory(prices, '  שמן ')).toEqual({ unitPrice: 12, unit: 'liter' });
  });

  it('returns nulls for a material the farm has no price for', () => {
    expect(sprayPriceMemory(prices, 'עלסר')).toEqual({ unitPrice: null, unit: null });
    expect(sprayPriceMemory(prices, null)).toEqual({ unitPrice: null, unit: null });
  });
});

// Ido's own words for what this grid has to do: "in the spray journal the
// material field opens a list, I pick the material, type the quantity, and the
// money is already calculated". So the priced materials have to come first, and
// a material with no price still has to be on the grid.
describe('sprayMaterialChoices', () => {
  const prices: SprayPriceRow[] = [
    { materialNormalized: 'קונפידור', unitPrice: 40, unit: 'kg' },
    { materialNormalized: 'שמן', unitPrice: 12, unit: 'liter' },
  ];

  it('puts the priced materials first, then the ones only sprayed before', () => {
    expect(sprayMaterialChoices(prices, ['עלסר', 'שמן'])).toEqual([
      { material: 'קונפידור', unitPrice: 40, unit: 'kg' },
      { material: 'שמן', unitPrice: 12, unit: 'liter' },
      { material: 'עלסר', unitPrice: null, unit: null },
    ]);
  });

  it('shows a material that is both priced and recently sprayed once', () => {
    const choices = sprayMaterialChoices(prices, ['קונפידור']);
    expect(choices.filter((choice) => choice.material === 'קונפידור')).toHaveLength(1);
  });

  // The pricelist stores only the normalized name, so a Latin material would
  // otherwise come back to the farmer lowercased.
  it('prefers the spelling the farmer typed over the normalized key', () => {
    const latin: SprayPriceRow[] = [{ materialNormalized: 'confidor', unitPrice: 40, unit: 'kg' }];
    expect(sprayMaterialChoices(latin, ['Confidor'])).toEqual([
      { material: 'Confidor', unitPrice: 40, unit: 'kg' },
    ]);
  });

  // Editing an old spray, or typing a material by hand, must not leave a value
  // with no tile of its own.
  it('carries the material already on the record even when nothing else knows it', () => {
    const choices = sprayMaterialChoices([], [], 'גופרית');
    expect(choices).toEqual([{ material: 'גופרית', unitPrice: null, unit: null }]);
    expect(sprayMaterialChoices([], [], '   ')).toEqual([]);
  });
});

describe('sprayPricelistRows', () => {
  const rows: SprayPriceRow[] = [
    { materialNormalized: 'שמן', unitPrice: 12, unit: 'liter' },
    { materialNormalized: 'גופרית', unitPrice: 8, unit: 'kg' },
  ];

  it('sorts by material name, because a pricelist is scanned and not read', () => {
    expect(sprayPricelistRows(rows).map((row) => row.materialNormalized)).toEqual([
      'גופרית',
      'שמן',
    ]);
  });

  it('writes a just-saved price over the loaded one instead of listing it twice', () => {
    const merged = sprayPricelistRows(rows, [
      { materialNormalized: 'שמן', unitPrice: 15, unit: 'liter' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.materialNormalized === 'שמן')?.unitPrice).toBe(15);
  });

  it('adds a material saved for the first time', () => {
    const merged = sprayPricelistRows(rows, [
      { materialNormalized: 'קונפידור', unitPrice: 40, unit: 'kg' },
    ]);
    expect(merged.map((row) => row.materialNormalized)).toEqual(['גופרית', 'קונפידור', 'שמן']);
  });
});

describe('the cost as the farmer builds it', () => {
  const base = newSprayDraft(new Date(2026, 8, 3), null);
  const prices: SprayPriceRow[] = [{ materialNormalized: 'קונפידור', unitPrice: 40, unit: 'kg' }];

  it('pre-fills the unit and price from the pricelist when the material is picked', () => {
    const draft = applySprayMaterial(base, 'קונפידור', [], prices);
    expect(draft.unitPrice).toBe(40);
    expect(draft.quantityUnit).toBe('kg');
  });

  it('computes the cost from quantity once a price is known', () => {
    const withPrice = applySprayMaterial(base, 'קונפידור', [], prices);
    const withQty = applySprayQuantity(withPrice, 3);
    expect(withQty.cost).toBe(120);
  });

  it('recomputes the cost when the price is corrected, as long as it was not typed', () => {
    const draft = applySprayUnitPrice(applySprayQuantity(base, 2), 10);
    expect(draft.cost).toBe(20);
    expect(applySprayUnitPrice(draft, 15).cost).toBe(30);
  });

  // The founder's rule: always let the farmer type the number himself. A typed
  // total wins over the formula and is not overwritten by later tweaks.
  it('lets a typed total win and stops recomputing it', () => {
    const auto = applySprayUnitPrice(applySprayQuantity(base, 2), 10);
    const typed = applySprayCost(auto, 55);
    expect(typed.cost).toBe(55);
    expect(applySprayQuantity(typed, 9).cost).toBe(55);
  });

  it('returns a typed total to auto when it is cleared', () => {
    const typed = applySprayCost(applySprayUnitPrice(applySprayQuantity(base, 2), 10), 55);
    const cleared = applySprayCost(typed, null);
    expect(applySprayQuantity(cleared, 3).cost).toBe(30);
  });

  // Manual entry with no pricelist at all: the farmer just types what it cost.
  it('accepts a bare total with no quantity and no price', () => {
    const draft = applySprayCost({ ...base, pest: 'כנימה', material: 'עלסר' }, 250);
    const input = sprayEntryInput(draft);
    expect(input.sprayCost).toBe(250);
    expect(input.sprayQuantity).toBeNull();
    expect(input.sprayUnitPrice).toBeNull();
  });

  it('carries quantity, unit, price and cost into the write', () => {
    const draft = applySprayCost(
      applySprayUnit(
        applySprayQuantity(applySprayUnitPrice({ ...base, pest: 'כ', material: 'ק' }, 40), 3),
        'kg',
      ),
      120,
    );
    const input = sprayEntryInput(draft);
    expect(input.sprayQuantity).toBe(3);
    expect(input.sprayQuantityUnit).toBe('kg');
    expect(input.sprayUnitPrice).toBe(40);
    expect(input.sprayCost).toBe(120);
  });

  // Picking a different material re-decides the price, like the dose, and the
  // cost follows the new price rather than the old one.
  it('re-decides the price when the material changes', () => {
    const first = applySprayQuantity(applySprayMaterial(base, 'קונפידור', [], prices), 2);
    expect(first.cost).toBe(80);
    const second = applySprayMaterial(first, 'עלסר', [], prices);
    expect(second.unitPrice).toBeNull();
    expect(second.cost).toBeNull();
  });
});

// **The bug this locks out shipped, and the existing tests did not catch it.**
// sprayDateOptions returns label *keys*, the tests asserted those keys, and
// nobody had put them in the string table -- so the farmer's screen read
// "spray.date.today" where it should have said "היום". Asserting the key is
// asserting that the code agrees with itself. This asserts it against the
// table the user actually reads, which is the only assertion that would have
// failed.
describe('spray entry, every generated label key has Hebrew behind it', () => {
  it('resolves the date tile labels to real words', () => {
    const now = new Date(2026, 8, 3, 10, 0, 0);
    for (const option of sprayDateOptions(now)) {
      expect(t(option.labelKey), `${option.labelKey} is missing from i18n`).not.toBe(
        option.labelKey,
      );
    }
  });
});
