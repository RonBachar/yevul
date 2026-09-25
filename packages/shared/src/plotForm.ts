// Adding and editing a plot as one flat form: a draft plus the rules for what
// blocks saving it and what the save writes. Every field is on screen at
// once, in both clients, for create and edit alike.
//
// **This replaced a five-step walk.** The form used to be a tile-picker walk
// with a "בדקו ושמרו" review screen, built as the second rollout of the
// pattern SprayEntrySheet introduced. Spec item 4 of
// docs/spec-money-and-tasks.md section 4 killed it in the founder's own
// words: one profile screen, no stepper, no review screen, no progress
// counter, no tile pickers. The walk's machinery -- steps, prefilled steps
// skipped on the walk, jump-back-from-review -- is deleted along with it
// rather than left dormant: a form this short has no use for it, and a
// disabled walk sitting unused in the file is a trap for the next change, not
// a feature kept in reserve.
//
// **Nothing here imports react or supabase-js.** Plot, CropCycle,
// CreatePlotInput and UpdatePlotInput are type-only imports and are erased at
// compile time. What lives here: what a draft looks like, which unit a plot
// ends up carrying, what stops the save, and what the picked values become
// for createPlot, updatePlot and updateForecast. What stays in the two
// screens: rendering and touch.
//
// ============================================================
// Two fields changed shape from the walk; the rest just lost their steps.
//
//   cropName   **Free text now, no tile grid.** The grid used to read the
//              farm's own crop_cycles (useCropSuggestions in plots.ts) so a
//              recent crop was one tap; spec item 4 refuses that outright --
//              "בלי קוביות ובלי רשימה סגורה" -- so the suggestion query is
//              gone with the grid, and the farmer types whatever he grows.
//
//   the three forecast fields   **New.** יבול צפוי, מחיר משוער and מועד
//              קטיף משוער used to be reachable only from a second "עדכון
//              צפי" tab on the plot detail screen. Spec item 4 asks for them
//              on this screen too, so a farmer who already knows his numbers
//              does not need a second trip. That other screen is untouched --
//              it is still how a forecast gets updated after the fact, once
//              the season is under way.
//
//   name, area, areaUnit   **Unchanged in substance.** A plot name is typed
//              because it is unique text with no history to draw a grid
//              from. Area is typed and not required, because plots.area is a
//              nullable column and an empty plot is a real one. The unit is
//              still never asked -- it is a farm setting, decided once in
//              Settings, and plotAreaUnit still resolves it the same way: a
//              new plot takes the farm's unit, an edit keeps carrying its
//              own regardless of what the farm setting has since become.
// ============================================================

import type { CreatePlotInput, CropCycle, Plot, UpdatePlotInput } from './plots';
import type { AreaUnit } from './settings';

export type PlotFormMode = 'create' | 'edit';

export type PlotDraft = {
  mode: PlotFormMode;
  name: string;
  area: number | null;
  // **null means "follow the farm setting", and it is not the same as 'dunam'.**
  // useFarmSettings loads after the screen mounts, so a draft that captured a
  // unit at mount would freeze the fallback and hand a farmer who chose
  // hectares a plot measured in dunams -- which is the bug the old form's
  // `areaUnit ?? settings.form?.areaUnit ?? 'dunam'` was written to fix. The
  // resolution is deferred to plotAreaUnit and happens at render and at save.
  areaUnit: AreaUnit | null;
  cropName: string;
  expectedYieldPerArea: number | null;
  expectedPricePerUnit: number | null;
  // מועד קטיף משוער, a YYYY-MM-DD day picked off the calendar. Optional, like
  // the other two forecast fields -- most plots carry none for most of the
  // year, and that is a normal state and not an unanswered question.
  expectedHarvestDate: string | null;
};

// The unit a plot with no explicit choice ends up with. Last resort only: it is
// reached when the farm's settings failed to load, and it is the same fallback
// the form has always used.
export const PLOT_AREA_UNIT_FALLBACK: AreaUnit = 'dunam';

export function plotAreaUnit(draft: PlotDraft, farmAreaUnit: AreaUnit | null): AreaUnit {
  return draft.areaUnit ?? farmAreaUnit ?? PLOT_AREA_UNIT_FALLBACK;
}

export function newPlotDraft(): PlotDraft {
  return {
    mode: 'create',
    name: '',
    area: null,
    areaUnit: null,
    cropName: '',
    expectedYieldPerArea: null,
    expectedPricePerUnit: null,
    expectedHarvestDate: null,
  };
}

// **The plot's own unit is carried, and it overrides the farm setting.** A plot
// recorded in hectares on a farm that has since switched to dunams keeps its
// hectares: the stored number means nothing without the unit it was measured
// in, and quietly relabelling 4 hectares as 4 dunams would be a data change
// disguised as a form default.
//
// cropName and cropCycle come in as separate arguments from plot because none
// of what they carry is a column on the plot row -- it lives on the plot's
// current crop_cycle, which the caller has loaded alongside it. cropCycle is
// optional and only read for its three forecast fields; a plot with no cycle
// at all (should not happen, see setPlotCrop) reads as every one of them
// unanswered rather than as answered with nothing.
export function plotDraftFromPlot(
  plot: Plot,
  cropName: string | null,
  cropCycle: CropCycle | null = null,
): PlotDraft {
  return {
    mode: 'edit',
    name: plot.name,
    area: plot.area,
    areaUnit: plot.areaUnit,
    cropName: cropName ?? '',
    expectedYieldPerArea: cropCycle?.expectedYieldPerArea ?? null,
    expectedPricePerUnit: cropCycle?.expectedPricePerUnit ?? null,
    expectedHarvestDate: cropCycle?.expectedHarvestDate ?? null,
  };
}

// ============================================================
// Reading the numeric fields this form types: area, and now the yield and
// the price. All three are optional numbers with the same shape of answer --
// empty is a real value, a comma is a decimal point, a negative one is not a
// value at all -- so one parser and one formatter serve all three instead of
// three copies of the same rule.
// ============================================================

// null is "no value", which is a real answer -- plots.area and the two
// forecast number columns are all nullable, and the form has always accepted
// an empty box. undefined is "what is in the box is not a number", which
// must not quietly become a saved null. The same three-way convention as
// parseSprayPhiDaysInput, and the same reason.
//
// **The comma is replaced because a Hebrew keyboard's decimal separator is a
// comma**, and `Number('40,5')` is NaN. The old form did this replacement too;
// what it did not do was notice the NaN, so "abc" was written as a null area
// with no word said. Now the field refuses to save and says why.
export function parsePlotAreaInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

// What a number field should show when it is opened on an existing value.
// String(value) and not a formatted one: formatNumber inserts a thousands
// separator, and a separator that is then read back by parsePlotAreaInput is a
// number the farmer cannot re-save.
export function plotAreaInputText(value: number | null): string {
  return value === null ? '' : String(value);
}

// ============================================================
// What stops the save, and what the save writes.
// ============================================================

export type PlotFormBlocker = 'nameRequired' | 'cropNameRequired';

export const PLOT_BLOCKER_MESSAGE_KEYS: Record<PlotFormBlocker, string> = {
  nameRequired: 'plots.form.nameRequired',
  cropNameRequired: 'plots.form.cropNameRequired',
};

// Asked before the save button is offered rather than after the write comes
// back, for the reason sprayEntryBlocker exists: an error a farmer can do
// nothing about, on a screen with no field for it, is the worst place to be
// told. It deliberately mirrors the guards inside createPlot, updatePlot and
// setPlotCrop rather than sharing them -- those belong to the write -- and a
// test holds them to the same answer.
//
// The three forecast fields are never a blocker: they are optional on both a
// create and an edit, exactly as spec item 4 asks for them.
export function plotFormBlocker(draft: PlotDraft): PlotFormBlocker | null {
  if (!draft.name.trim()) return 'nameRequired';
  if (!draft.cropName.trim()) return 'cropNameRequired';
  return null;
}

// **Every field the old form wrote is still written, plus the three forecast
// fields spec item 4 adds.** name, area and area_unit on plots; name and the
// current year as season, plus the forecast columns, on the crop_cycle
// createPlot builds itself. See createPlot for how a plot with no forecast at
// all keeps forecast_updated_at untouched.
export function plotCreateInput(draft: PlotDraft, farmAreaUnit: AreaUnit | null): CreatePlotInput {
  return {
    name: draft.name.trim(),
    area: draft.area,
    areaUnit: plotAreaUnit(draft, farmAreaUnit),
    cropName: draft.cropName.trim(),
    expectedYieldPerArea: draft.expectedYieldPerArea,
    expectedPricePerUnit: draft.expectedPricePerUnit,
    expectedHarvestDate: draft.expectedHarvestDate,
  };
}

// **Widened past UpdatePlotInput on purpose, and that is not an accident of
// typing.** The three forecast fields are not columns on `plots`, so
// updatePlot itself must not receive them -- but they still belong on this
// one screen's save, as a second write through updateForecast on the plot's
// crop_cycle. Building both halves here, off the same draft, keeps the
// trimming and the unit resolution in one tested place; the screen passes the
// same result to updatePlot (which reads only its three own keys) and lifts
// the forecast keys back out for updateForecast.
export function plotUpdateInput(
  draft: PlotDraft,
  farmAreaUnit: AreaUnit | null,
): UpdatePlotInput & {
  expectedYieldPerArea: number | null;
  expectedPricePerUnit: number | null;
  expectedHarvestDate: string | null;
} {
  return {
    name: draft.name.trim(),
    area: draft.area,
    areaUnit: plotAreaUnit(draft, farmAreaUnit),
    expectedYieldPerArea: draft.expectedYieldPerArea,
    expectedPricePerUnit: draft.expectedPricePerUnit,
    expectedHarvestDate: draft.expectedHarvestDate,
  };
}

// ============================================================
// Whether the forecast half of the save has anything to write.
// ============================================================

export type PlotForecastValues = {
  expectedYieldPerArea: number | null;
  expectedPricePerUnit: number | null;
  expectedHarvestDate: string | null;
};

// **`forecast_updated_at` is the staleness clock, and calling updateForecast
// resets it whether or not a forecast value moved.** That clock is the whole
// basis of the nudge on the profitability tab -- "not updated since April,
// still right?" fires at three months, see staleForecastSince in plots.ts.
//
// Now that the forecast shares a screen with the plot's name and area, a
// farmer who renames a plot is saving the forecast fields too. Without this
// check every such edit would silently restart the clock, and a farmer who
// tidies his plot names occasionally would never be asked about a forecast
// again. The nudge would not break loudly; it would simply never appear, which
// is the kind of failure nobody reports.
//
// A missing cycle means nothing has been recorded yet, so only real values
// count as a change; clearing an empty field is not one.
export function plotForecastChanged(
  current: PlotForecastValues | null,
  next: PlotForecastValues,
): boolean {
  if (!current) {
    return (
      next.expectedYieldPerArea !== null ||
      next.expectedPricePerUnit !== null ||
      next.expectedHarvestDate !== null
    );
  }
  return (
    current.expectedYieldPerArea !== next.expectedYieldPerArea ||
    current.expectedPricePerUnit !== next.expectedPricePerUnit ||
    current.expectedHarvestDate !== next.expectedHarvestDate
  );
}
