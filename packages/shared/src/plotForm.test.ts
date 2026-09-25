import { describe, expect, it } from 'vitest';
import { createPlot, updatePlot, type CropCycle, type Plot } from './plots';
import {
  newPlotDraft,
  parsePlotAreaInput,
  plotAreaInputText,
  plotAreaUnit,
  plotCreateInput,
  plotDraftFromPlot,
  plotForecastChanged,
  plotFormBlocker,
  plotUpdateInput,
  PLOT_AREA_UNIT_FALLBACK,
  type PlotDraft,
} from './plotForm';

function plot(overrides: Partial<Plot> = {}): Plot {
  return {
    id: 'plot-1',
    farmId: 'farm-1',
    name: 'החלקה הדרומית',
    area: 40,
    areaUnit: 'dunam',
    ...overrides,
  };
}

function cropCycle(overrides: Partial<CropCycle> = {}): CropCycle {
  return {
    id: 'cycle-1',
    plotId: 'plot-1',
    name: 'זיתים',
    season: '2026',
    yieldUnit: null,
    priceUnit: null,
    expectedYieldPerArea: null,
    expectedPricePerUnit: null,
    expectedHarvestDate: null,
    forecastUpdatedAt: null,
    ...overrides,
  };
}

// A finished create draft, the state the save button is looking at.
function ready(overrides: Partial<PlotDraft> = {}): PlotDraft {
  return { ...newPlotDraft(), name: 'החלקה הדרומית', area: 40, cropName: 'זיתים', ...overrides };
}

describe('newPlotDraft', () => {
  it('starts empty, in create mode, with no forecast and the unit already answered', () => {
    expect(newPlotDraft()).toEqual({
      mode: 'create',
      name: '',
      area: null,
      areaUnit: null,
      cropName: '',
      expectedYieldPerArea: null,
      expectedPricePerUnit: null,
      expectedHarvestDate: null,
    });
  });
});

describe('plotDraftFromPlot', () => {
  it('opens an existing plot in edit mode with its own values, crop included', () => {
    expect(plotDraftFromPlot(plot(), 'זיתים')).toEqual({
      mode: 'edit',
      name: 'החלקה הדרומית',
      area: 40,
      areaUnit: 'dunam',
      cropName: 'זיתים',
      expectedYieldPerArea: null,
      expectedPricePerUnit: null,
      expectedHarvestDate: null,
    });
  });

  it('reads a plot with no crop cycle as a crop not yet answered', () => {
    expect(plotDraftFromPlot(plot(), null).cropName).toBe('');
  });

  it('carries a plot with no area through as having none', () => {
    expect(plotDraftFromPlot(plot({ area: null }), 'זיתים').area).toBeNull();
  });

  // The three forecast fields live on the crop_cycle, not on the plot row --
  // this is the second write the plot form's edit save reads them back for.
  it('reads the three forecast fields off the crop cycle when one is given', () => {
    const draft = plotDraftFromPlot(
      plot(),
      'זיתים',
      cropCycle({ expectedYieldPerArea: 3.2, expectedPricePerUnit: 5, expectedHarvestDate: '2026-10-01' }),
    );
    expect(draft.expectedYieldPerArea).toBe(3.2);
    expect(draft.expectedPricePerUnit).toBe(5);
    expect(draft.expectedHarvestDate).toBe('2026-10-01');
  });

  it('reads a plot whose cycle carries no forecast as having none, not zero', () => {
    expect(plotDraftFromPlot(plot(), 'זיתים', cropCycle()).expectedYieldPerArea).toBeNull();
  });
});

// ============================================================
// Which unit a plot ends up carrying.
//
// **The stored number means nothing without it**, which is why this is resolved
// at render and at save rather than captured when the screen mounts: the farm
// settings arrive after the first render, and a draft that had already frozen
// the fallback would hand a farmer who chose hectares a plot in dunams.
// ============================================================

describe('plotAreaUnit', () => {
  it('follows the farm setting when the farmer has not chosen one', () => {
    expect(plotAreaUnit(newPlotDraft(), 'hectare')).toBe('hectare');
  });

  it('lets an explicit choice override the farm setting', () => {
    expect(plotAreaUnit({ ...newPlotDraft(), areaUnit: 'acre' }, 'hectare')).toBe('acre');
  });

  it('falls back only when the settings did not load', () => {
    expect(plotAreaUnit(newPlotDraft(), null)).toBe(PLOT_AREA_UNIT_FALLBACK);
  });

  // **An existing plot keeps the unit it was measured in.** Relabelling 4
  // hectares as 4 dunams because the farm has since switched its setting would
  // be a data change wearing the clothes of a form default.
  it('keeps an existing plot in its own unit even when the farm has moved on', () => {
    expect(plotAreaUnit(plotDraftFromPlot(plot({ areaUnit: 'hectare' }), 'זיתים'), 'dunam')).toBe(
      'hectare',
    );
  });

  it('puts a plot that never had a unit onto the farm setting', () => {
    expect(plotAreaUnit(plotDraftFromPlot(plot({ areaUnit: null }), 'זיתים'), 'acre')).toBe('acre');
  });
});

// ============================================================
// The three numeric fields this form types: area, yield and price. All three
// are optional and share one parser and one formatter -- see plotForm.ts.
// ============================================================

describe('parsePlotAreaInput', () => {
  it('reads a plain number', () => {
    expect(parsePlotAreaInput('40')).toBe(40);
    expect(parsePlotAreaInput('  12.5  ')).toBe(12.5);
  });

  // A Hebrew keyboard's decimal separator is a comma, and Number('40,5') is
  // NaN. The one-page form did this replacement too.
  it('accepts a comma where a decimal point belongs', () => {
    expect(parsePlotAreaInput('40,5')).toBe(40.5);
  });

  // plots.area is nullable and an empty box has always meant "no value".
  it('reads an empty box as no value at all', () => {
    expect(parsePlotAreaInput('')).toBeNull();
    expect(parsePlotAreaInput('   ')).toBeNull();
  });

  // **undefined and null are different answers.** The one-page form ran
  // Number() over whatever was typed and wrote the NaN without a word; a value
  // that silently vanished looks exactly like one that was never entered.
  it('refuses what is not a number instead of calling it empty', () => {
    expect(parsePlotAreaInput('abc')).toBeUndefined();
    expect(parsePlotAreaInput('1.2.3')).toBeUndefined();
  });

  it('refuses a negative value', () => {
    expect(parsePlotAreaInput('-5')).toBeUndefined();
  });
});

describe('plotAreaInputText', () => {
  // String(value) and not formatNumber: a thousands separator that is then read
  // back by parsePlotAreaInput is a number the farmer cannot re-save.
  it('opens the box on the stored number, unformatted', () => {
    expect(plotAreaInputText(1200)).toBe('1200');
    expect(plotAreaInputText(12.5)).toBe('12.5');
  });

  it('opens empty when there is no value', () => {
    expect(plotAreaInputText(null)).toBe('');
  });
});

// ============================================================
// What stops the save.
// ============================================================

describe('plotFormBlocker', () => {
  it('lets a finished create through', () => {
    expect(plotFormBlocker(ready())).toBeNull();
  });

  it('lets a plot through with no area at all', () => {
    expect(plotFormBlocker(ready({ area: null }))).toBeNull();
  });

  // The three forecast fields are never a blocker, on a create or an edit.
  it('lets a plot through with no forecast at all', () => {
    expect(
      plotFormBlocker(
        ready({ expectedYieldPerArea: null, expectedPricePerUnit: null, expectedHarvestDate: null }),
      ),
    ).toBeNull();
  });

  it('stops a nameless plot, and a whitespace name is nameless', () => {
    expect(plotFormBlocker(ready({ name: '' }))).toBe('nameRequired');
    expect(plotFormBlocker(ready({ name: '   ' }))).toBe('nameRequired');
  });

  it('stops a new plot with no crop', () => {
    expect(plotFormBlocker(ready({ cropName: '  ' }))).toBe('cropNameRequired');
  });

  it("lets an edit through once it carries the plot's crop", () => {
    expect(plotFormBlocker(plotDraftFromPlot(plot(), 'זיתים'))).toBeNull();
  });

  // An edit asks for the crop, so it has to refuse an empty one for the same
  // reason a create does: a form that shows a field and then saves it away
  // blank is worse than one that never showed it.
  it('stops an edit whose crop was emptied', () => {
    const draft = { ...plotDraftFromPlot(plot(), 'זיתים'), cropName: '  ' };
    expect(plotFormBlocker(draft)).toBe('cropNameRequired');
  });

  // **The rule is asked before the save button, and the write asks it again.**
  // The two are separate functions on purpose (see the header), so these hold
  // them to the same answer -- a blocker that let something through which
  // createPlot then refused would put a database error in front of a farmer on
  // a screen with no field to fix it.
  const refuseDatabase = {
    from: () => {
      throw new Error('the write must be refused before it reaches the database');
    },
  } as never;

  it('agrees with what createPlot itself refuses', async () => {
    const nameless = ready({ name: '' });
    expect(plotFormBlocker(nameless)).toBe('nameRequired');
    expect(await createPlot(refuseDatabase, 'farm-1', plotCreateInput(nameless, 'dunam'))).toEqual({
      ok: false,
      reason: 'nameRequired',
    });

    const cropless = ready({ cropName: '' });
    expect(plotFormBlocker(cropless)).toBe('cropNameRequired');
    expect(await createPlot(refuseDatabase, 'farm-1', plotCreateInput(cropless, 'dunam'))).toEqual({
      ok: false,
      reason: 'cropNameRequired',
    });
  });

  it('agrees with what updatePlot itself refuses', async () => {
    const nameless = { ...plotDraftFromPlot(plot(), 'זיתים'), name: '  ' };
    expect(plotFormBlocker(nameless)).toBe('nameRequired');
    expect(await updatePlot(refuseDatabase, 'plot-1', plotUpdateInput(nameless, 'dunam'))).toEqual({
      ok: false,
      reason: 'nameRequired',
    });
  });
});

// ============================================================
// What the save writes.
// ============================================================

describe('plotCreateInput', () => {
  it('carries the name, the area, the unit and the crop through exactly', () => {
    expect(plotCreateInput(ready(), 'dunam')).toEqual({
      name: 'החלקה הדרומית',
      area: 40,
      areaUnit: 'dunam',
      cropName: 'זיתים',
      expectedYieldPerArea: null,
      expectedPricePerUnit: null,
      expectedHarvestDate: null,
    });
  });

  it('trims the two typed names', () => {
    expect(plotCreateInput(ready({ name: '  צפון  ', cropName: '  חיטה  ' }), 'dunam')).toEqual({
      name: 'צפון',
      area: 40,
      areaUnit: 'dunam',
      cropName: 'חיטה',
      expectedYieldPerArea: null,
      expectedPricePerUnit: null,
      expectedHarvestDate: null,
    });
  });

  it('writes a null area rather than a zero when the field was left empty', () => {
    expect(plotCreateInput(ready({ area: null }), 'dunam').area).toBeNull();
  });

  it('writes the unit the farm measures in', () => {
    expect(plotCreateInput(ready(), 'hectare').areaUnit).toBe('hectare');
    expect(plotCreateInput(ready({ areaUnit: 'acre' }), 'hectare').areaUnit).toBe('acre');
  });

  // Spec item 4 adds these three fields to the create screen itself; this
  // holds plotCreateInput to actually carrying them through to createPlot.
  it('carries the three forecast fields through to the create input', () => {
    expect(
      plotCreateInput(
        ready({
          expectedYieldPerArea: 3.5,
          expectedPricePerUnit: 4,
          expectedHarvestDate: '2026-10-01',
        }),
        'dunam',
      ),
    ).toEqual({
      name: 'החלקה הדרומית',
      area: 40,
      areaUnit: 'dunam',
      cropName: 'זיתים',
      expectedYieldPerArea: 3.5,
      expectedPricePerUnit: 4,
      expectedHarvestDate: '2026-10-01',
    });
  });
});

describe('plotUpdateInput', () => {
  it('writes the three plot columns, plus the three forecast fields for the second write', () => {
    const draft = { ...plotDraftFromPlot(plot(), 'זיתים'), name: 'החלקה הצפונית', area: 12.5 };
    expect(plotUpdateInput(draft, 'dunam')).toEqual({
      name: 'החלקה הצפונית',
      area: 12.5,
      areaUnit: 'dunam',
      expectedYieldPerArea: null,
      expectedPricePerUnit: null,
      expectedHarvestDate: null,
    });
  });

  // **The crop is still not a column of plots.** It goes to crop_cycles
  // through setPlotCrop, as a separate write, and this input must not carry it
  // into a table that has no such column.
  it('has no crop in it at all', () => {
    expect(plotUpdateInput(plotDraftFromPlot(plot(), 'זיתים'), 'dunam')).not.toHaveProperty(
      'cropName',
    );
  });

  it('carries the three forecast fields through, for updateForecast to pick up', () => {
    const draft = {
      ...plotDraftFromPlot(plot(), 'זיתים'),
      expectedYieldPerArea: 2,
      expectedPricePerUnit: 6.5,
      expectedHarvestDate: '2026-11-15',
    };
    expect(plotUpdateInput(draft, 'dunam')).toMatchObject({
      expectedYieldPerArea: 2,
      expectedPricePerUnit: 6.5,
      expectedHarvestDate: '2026-11-15',
    });
  });
});

// הכלל היחיד שמגן על נודניק ההתיישנות מאז שהצפי חולק מסך עם שם החלקה
// והשטח. אם הוא ייפול, `forecast_updated_at` יתאפס בכל שמירה, והנודניק
// פשוט לא יופיע יותר לאף חקלאי, בלי שום שגיאה שתסגיר את זה.
describe('plotForecastChanged', () => {
  const cycle = {
    expectedYieldPerArea: 3.5,
    expectedPricePerUnit: 4.2,
    expectedHarvestDate: '2026-09-28',
  };

  it('is false when a save carries the forecast through untouched', () => {
    expect(plotForecastChanged(cycle, { ...cycle })).toBe(false);
  });

  it('is true when any one of the three moves', () => {
    expect(plotForecastChanged(cycle, { ...cycle, expectedYieldPerArea: 4 })).toBe(true);
    expect(plotForecastChanged(cycle, { ...cycle, expectedPricePerUnit: 5 })).toBe(true);
    expect(plotForecastChanged(cycle, { ...cycle, expectedHarvestDate: '2026-10-01' })).toBe(true);
  });

  it('is true when a value is cleared, because clearing is a real edit', () => {
    expect(plotForecastChanged(cycle, { ...cycle, expectedYieldPerArea: null })).toBe(true);
  });

  it('is false for a plot with no cycle and nothing entered', () => {
    expect(
      plotForecastChanged(null, {
        expectedYieldPerArea: null,
        expectedPricePerUnit: null,
        expectedHarvestDate: null,
      }),
    ).toBe(false);
  });

  it('is true for a plot with no cycle that is given its first value', () => {
    expect(
      plotForecastChanged(null, {
        expectedYieldPerArea: 3,
        expectedPricePerUnit: null,
        expectedHarvestDate: null,
      }),
    ).toBe(true);
  });
});
