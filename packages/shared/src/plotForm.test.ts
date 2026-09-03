import { describe, expect, it } from 'vitest';
import { createPlot, updatePlot, type Plot } from './plots';
import {
  newPlotDraft,
  nextPlotStep,
  parsePlotAreaInput,
  plotAreaInputText,
  plotAreaUnit,
  plotCreateInput,
  plotCropOptions,
  plotDraftFromPlot,
  plotFormBlocker,
  plotStepFieldKey,
  plotStepPosition,
  plotStepRequired,
  plotStepTitleKey,
  plotUpdateInput,
  plotVisibleSteps,
  previousPlotStep,
  PLOT_AREA_UNIT_FALLBACK,
  PLOT_CROP_TILE_LIMIT,
  PLOT_STEPS,
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

// A finished create draft, the state the review screen is looking at.
function ready(overrides: Partial<PlotDraft> = {}): PlotDraft {
  return { ...newPlotDraft(), name: 'החלקה הדרומית', area: 40, cropName: 'זיתים', ...overrides };
}

// ============================================================
// The crop grid.
//
// The one field on this form that became tiles because the farm's own history
// can fill it, which is the case useSpraySuggestions established for pests and
// materials. The source is crop_cycles; see useCropSuggestions in plots.ts.
// ============================================================

describe('plotCropOptions', () => {
  it('offers what this farm has grown, newest first, with no duplicates', () => {
    expect(plotCropOptions(['אבטיחים', 'זיתים', 'אבטיחים', 'חיטה'])).toEqual([
      'אבטיחים',
      'זיתים',
      'חיטה',
    ]);
  });

  it('trims, and treats a blank or missing crop name as absent', () => {
    expect(plotCropOptions(['  זיתים  ', '', '   ', null])).toEqual(['זיתים']);
  });

  it('stops at the limit, so an old crop cannot push a recent one off screen', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(plotCropOptions(many)).toHaveLength(PLOT_CROP_TILE_LIMIT);
    expect(plotCropOptions(many, 2)).toEqual(['a', 'b']);
  });

  // **The first run, and it is the most important path in the app for a new
  // user.** A brand new farm has no crop_cycles at all, so the grid is empty.
  // That is a real state and the screen answers it with a sentence
  // (plots.form.emptyCrops) and a dashed "new crop" square, never a dead end.
  it('is empty on a brand new farm, rather than inventing a crop', () => {
    expect(plotCropOptions([])).toEqual([]);
  });
});

// ============================================================
// The walk.
// ============================================================

describe('the steps', () => {
  it('asks the plot fields in form order, then the review', () => {
    expect(PLOT_STEPS).toEqual(['name', 'area', 'areaUnit', 'crop', 'review']);
  });

  it('gives every step a distinct question and a distinct field label', () => {
    expect(new Set(PLOT_STEPS.map(plotStepTitleKey)).size).toBe(PLOT_STEPS.length);
    expect(new Set(PLOT_STEPS.map(plotStepFieldKey)).size).toBe(PLOT_STEPS.length);
  });

  // Required means the write refuses without it, and nothing else. The blocker
  // tests below hold that claim against createPlot and updatePlot themselves.
  it('marks the name and the crop required, and nothing else', () => {
    expect(PLOT_STEPS.filter(plotStepRequired)).toEqual(['name', 'crop']);
  });
});

describe('newPlotDraft', () => {
  it('starts empty, in create mode, with the unit already answered', () => {
    expect(newPlotDraft()).toEqual({
      mode: 'create',
      name: '',
      area: null,
      areaUnit: null,
      cropName: '',
      prefilled: ['areaUnit'],
    });
  });

  // **The unit is a farm setting and not a per-plot choice**, so the walk never
  // asks it. This is the same skip the spray flow makes with a dose the farm
  // already knows, and docs/open-items.md's "too many clicks" is the reason.
  it('walks the name, the area and the crop, and never the unit', () => {
    const draft = newPlotDraft();
    expect(plotVisibleSteps(draft)).toEqual(['name', 'area', 'crop', 'review']);
    expect(nextPlotStep('name', draft)).toBe('area');
    expect(nextPlotStep('area', draft)).toBe('crop');
    expect(nextPlotStep('crop', draft)).toBe('review');
  });

  it('counts the steps it will actually show', () => {
    const draft = newPlotDraft();
    expect(plotStepPosition('name', draft)).toEqual({ index: 1, total: 4 });
    expect(plotStepPosition('crop', draft)).toEqual({ index: 3, total: 4 });
    expect(plotStepPosition('review', draft)).toEqual({ index: 4, total: 4 });
  });

  it('walks backwards over the same steps and stops at the first', () => {
    const draft = newPlotDraft();
    expect(previousPlotStep('review', draft)).toBe('crop');
    expect(previousPlotStep('area', draft)).toBe('name');
    expect(previousPlotStep('name', draft)).toBeNull();
  });

  // The unit is reached only by tapping its tile on the review, so it has no
  // "next" of its own: the review is where it came from and where it goes back
  // to. Same rule as the spray flow's prefilled plot step.
  it('sends a step that is not on the walk back to the review', () => {
    const draft = newPlotDraft();
    expect(nextPlotStep('areaUnit', draft)).toBe('review');
    expect(previousPlotStep('areaUnit', draft)).toBeNull();
  });
});

describe('plotDraftFromPlot', () => {
  it('opens an existing plot in edit mode with its own values', () => {
    expect(plotDraftFromPlot(plot())).toEqual({
      mode: 'edit',
      name: 'החלקה הדרומית',
      area: 40,
      areaUnit: 'dunam',
      cropName: '',
      prefilled: ['areaUnit'],
    });
  });

  // The crop belongs to the CropCycle and is edited from the plot's own screen.
  // updatePlot does not touch it, and the old one-page form hid its box on an
  // edit for the same reason.
  it('never asks for a crop on an edit', () => {
    const draft = plotDraftFromPlot(plot());
    expect(plotVisibleSteps(draft)).toEqual(['name', 'area', 'review']);
    expect(nextPlotStep('area', draft)).toBe('review');
    expect(plotStepPosition('area', draft)).toEqual({ index: 2, total: 3 });
  });

  it('carries a plot with no area through as having none', () => {
    expect(plotDraftFromPlot(plot({ area: null })).area).toBeNull();
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

  it('lets an explicit choice on the review override the farm setting', () => {
    expect(plotAreaUnit({ ...newPlotDraft(), areaUnit: 'acre' }, 'hectare')).toBe('acre');
  });

  it('falls back only when the settings did not load', () => {
    expect(plotAreaUnit(newPlotDraft(), null)).toBe(PLOT_AREA_UNIT_FALLBACK);
  });

  // **An existing plot keeps the unit it was measured in.** Relabelling 4
  // hectares as 4 dunams because the farm has since switched its setting would
  // be a data change wearing the clothes of a form default.
  it('keeps an existing plot in its own unit even when the farm has moved on', () => {
    expect(plotAreaUnit(plotDraftFromPlot(plot({ areaUnit: 'hectare' })), 'dunam')).toBe('hectare');
  });

  it('puts a plot that never had a unit onto the farm setting', () => {
    expect(plotAreaUnit(plotDraftFromPlot(plot({ areaUnit: null })), 'acre')).toBe('acre');
  });
});

// ============================================================
// The two answers this flow still types.
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

  // plots.area is nullable and an empty box has always meant "no area".
  it('reads an empty box as a plot with no area', () => {
    expect(parsePlotAreaInput('')).toBeNull();
    expect(parsePlotAreaInput('   ')).toBeNull();
  });

  // **undefined and null are different answers.** The one-page form ran
  // Number() over whatever was typed and wrote the NaN without a word; a plot
  // whose area silently vanished looks exactly like a plot that never had one.
  it('refuses what is not a number instead of calling it no area', () => {
    expect(parsePlotAreaInput('abc')).toBeUndefined();
    expect(parsePlotAreaInput('1.2.3')).toBeUndefined();
  });

  it('refuses a negative area', () => {
    expect(parsePlotAreaInput('-5')).toBeUndefined();
  });
});

describe('plotAreaInputText', () => {
  // String(area) and not formatNumber: a thousands separator that is then read
  // back by parsePlotAreaInput is a number the farmer cannot re-save.
  it('opens the box on the stored number, unformatted', () => {
    expect(plotAreaInputText(1200)).toBe('1200');
    expect(plotAreaInputText(12.5)).toBe('12.5');
  });

  it('opens empty when the plot has no area', () => {
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

  it('stops a nameless plot, and a whitespace name is nameless', () => {
    expect(plotFormBlocker(ready({ name: '' }))).toBe('nameRequired');
    expect(plotFormBlocker(ready({ name: '   ' }))).toBe('nameRequired');
  });

  it('stops a new plot with no crop', () => {
    expect(plotFormBlocker(ready({ cropName: '  ' }))).toBe('cropNameRequired');
  });

  // An edit never asks for a crop and updatePlot never writes one, so a missing
  // crop must not block a name change.
  it('does not ask an edit for a crop', () => {
    expect(plotFormBlocker(plotDraftFromPlot(plot()))).toBeNull();
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
    const nameless = { ...plotDraftFromPlot(plot()), name: '  ' };
    expect(plotFormBlocker(nameless)).toBe('nameRequired');
    expect(await updatePlot(refuseDatabase, 'plot-1', plotUpdateInput(nameless, 'dunam'))).toEqual({
      ok: false,
      reason: 'nameRequired',
    });
  });
});

// ============================================================
// What the save writes.
//
// Nothing about entering a plot as tiles may change what is stored. These are
// the same three columns on plots, and the same crop name on the plot's first
// crop_cycle, that the one-page form wrote.
// ============================================================

describe('plotCreateInput', () => {
  it('carries the name, the area, the unit and the crop through exactly', () => {
    expect(plotCreateInput(ready(), 'dunam')).toEqual({
      name: 'החלקה הדרומית',
      area: 40,
      areaUnit: 'dunam',
      cropName: 'זיתים',
    });
  });

  it('trims the two typed names', () => {
    expect(plotCreateInput(ready({ name: '  צפון  ', cropName: '  חיטה  ' }), 'dunam')).toEqual({
      name: 'צפון',
      area: 40,
      areaUnit: 'dunam',
      cropName: 'חיטה',
    });
  });

  it('writes a null area rather than a zero when the question was skipped', () => {
    expect(plotCreateInput(ready({ area: null }), 'dunam').area).toBeNull();
  });

  it('writes the unit the farm measures in', () => {
    expect(plotCreateInput(ready(), 'hectare').areaUnit).toBe('hectare');
    expect(plotCreateInput(ready({ areaUnit: 'acre' }), 'hectare').areaUnit).toBe('acre');
  });
});

describe('plotUpdateInput', () => {
  it('writes the three plot columns and nothing else', () => {
    const draft = { ...plotDraftFromPlot(plot()), name: 'החלקה הצפונית', area: 12.5 };
    expect(plotUpdateInput(draft, 'dunam')).toEqual({
      name: 'החלקה הצפונית',
      area: 12.5,
      areaUnit: 'dunam',
    });
  });

  // The crop is not a column of plots. An edit carrying one would be writing to
  // a table updatePlot does not touch.
  it('has no crop in it at all', () => {
    expect(plotUpdateInput(plotDraftFromPlot(plot()), 'dunam')).not.toHaveProperty('cropName');
  });
});
