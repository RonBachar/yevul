// Adding and editing a plot as a walk through tiles, one question per screen.
//
// **The second consumer of the tile pattern, and a rollout rather than a new
// design.** SprayEntrySheet was built as a template and shown to the founder on
// a device; he approved it. This module is the same shape applied to the plot
// form, and everything structural about it -- steps, prefilled steps that are
// therefore not asked, a review that can jump back into any of them, a blocker
// asked before the save button rather than after the write -- is deliberately
// the same as packages/shared/src/sprayEntry.ts so that the two flows cannot
// drift into two different walks.
//
// **Neither frontend/mobile nor frontend/web has a test runner**, which is why
// this is a module and not a hook. What lives here: which tiles the crop step
// offers, which steps get asked at all, which unit a plot ends up carrying,
// what stops the save, and what the picked values become for createPlot and
// updatePlot. What stays in the two screens: rendering and touch.
//
// **Nothing here imports react or supabase-js.** Plot, CreatePlotInput and
// UpdatePlotInput are type-only imports and are erased at compile time, the
// same way sprayEntry.ts keeps LogEntry.
//
// ============================================================
// Which fields became tiles, which stayed typed, and why the answer is
// different for each. The pattern is a tool and not a quota.
//
//   name       **Typed, and it cannot honestly be anything else.** A plot name
//              is unique text by definition -- "the southern plot", "the plot
//              by the road" -- and every one is used exactly once. There is no
//              history to draw a grid from, because a name that already exists
//              is the one name a farmer will never pick again.
//
//   area       **Typed, and this is the deliberate refusal.** The obvious tile
//              grid is the areas of the plots he already has, and it is wrong:
//              two plots of the same size is a coincidence and not a pattern,
//              and area is the multiplier on the entire profit picture
//              (expectedIncomeFor in plots.ts is area x yield x price). A grid
//              of plausible-looking wrong numbers, one tap each, on the field
//              that silently scales every shekel the app ever shows him, buys
//              nothing and risks a lot. A number he knows, typed once, in a
//              decimal keypad.
//
//   areaUnit   **Not a step and not a tile. Removed on the founder's reaction
//              to seeing it: "why choose dunam or hectare at all, that is set
//              in the general settings". He is right -- it was on the review as
//              a tappable tile, and a value the farmer can change per plot is a
//              question whether or not it is prefilled.
//
//              The column still exists and is still written, because it has to
//              be: a plot measured in hectares means nothing if the farm later
//              switches to dunam, so plots.area_unit records the unit the number
//              was measured in. A new plot takes the farm setting; an edit
//              carries the plot's own unit through untouched. Nobody is asked,
//              and the review shows the area with its unit in one line, which is
//              the only place the unit was ever informative.
//
//   crop       **Tiles, from the farm's own crop history, on an edit as well as
//              on a create.** It used to be a create-only step, on the argument
//              that the crop belongs to crop_cycles and updatePlot does not
//              touch that table. The founder overruled it on 2026-09-09, looking
//              at a plot screen that had one pencil for the plot and a second
//              "edit crop" link inside the profitability tab: "the plot IS the
//              crop, why are there two". So this walk now owns all three fields
//              a plot has -- name, area, crop -- and the second edit affordance
//              is gone from both clients. The write is still two calls to two
//              tables (updatePlot, then setPlotCrop); that is a detail of the
//              schema and not something the farmer should have to know.
//
//              This is the case
//              useSpraySuggestions established: a farm grows a handful of
//              things and has grown them before, so the grid fills up over time
//              from what the farmer actually planted. The source is
//              crop_cycles, read by useCropSuggestions in plots.ts -- every
//              cycle the farm has, not only the current one per plot, so a crop
//              from an earlier season is still on the grid. First run is an
//              empty grid, which is a real state and is answered with a
//              sentence and an "add a new one" tile rather than a dead end.
//
//   season     **Not asked, and it was not asked before either.** createPlot
//              sets it to the current year, and prd.md says in as many words
//              that the farmer barely touches the season field. Turning a value
//              he never sees into a screen he has to walk past would be adding
//              a question, not converting one.
//
//   a date     **There isn't one.** Nothing the plot form writes takes a date
//              from the farmer -- plots carries none, and crop_cycles.season is
//              the year string above. So no DateField here, and no direction to
//              choose.
// ============================================================

import type { CreatePlotInput, Plot, UpdatePlotInput } from './plots';
import type { AreaUnit } from './settings';
import { recentValues } from './sprayEntry';

// ============================================================
// The crop tiles.
// ============================================================

// Six is three rows of two, the same number the spray grids use and for the
// same reason: it is what fits above the fold on a small phone.
export const PLOT_CROP_TILE_LIMIT = 6;

// **recentValues and not a second copy of it.** Trimmed, de-duplicated, newest
// first, capped -- one definition of "what this farm did recently", shared with
// the pest, material and dose grids, so that a fix to the rule cannot land in
// one grid and miss another.
export function plotCropOptions(
  names: readonly (string | null)[],
  limit: number = PLOT_CROP_TILE_LIMIT,
): string[] {
  return recentValues(names, limit);
}

// ============================================================
// The walk.
// ============================================================

export type PlotStep = 'name' | 'area' | 'crop' | 'review';

export const PLOT_STEPS: readonly PlotStep[] = ['name', 'area', 'crop', 'review'];

// The question over each grid. These are questions and not field labels: "what
// is the plot called", not "name".
const PLOT_STEP_TITLE_KEYS: Record<PlotStep, string> = {
  name: 'plots.form.step.name',
  area: 'plots.form.step.area',
  crop: 'plots.form.step.crop',
  review: 'plots.form.step.review',
};

export function plotStepTitleKey(step: PlotStep): string {
  return PLOT_STEP_TITLE_KEYS[step];
}

// The field label each value is filed under on the review screen. Existing keys
// on purpose, exactly as the spray review does it: these are the same fields
// the old form named, and a second set of strings for them would be two
// wordings of one field.
const PLOT_STEP_FIELD_KEYS: Record<PlotStep, string> = {
  name: 'plots.form.name',
  area: 'plots.form.area',
  crop: 'plots.form.cropName',
  review: 'plots.form.step.review',
};

export function plotStepFieldKey(step: PlotStep): string {
  return PLOT_STEP_FIELD_KEYS[step];
}

// **Required means the write refuses without it, and nothing else.** createPlot
// refuses on an empty name and on an empty crop name; updatePlot refuses on an
// empty name and setPlotCrop on an empty crop name. plots.area is a nullable
// column and plots.area_unit always carries the farm's setting, so neither is
// required. Marking anything else here would invent a rule the write does not
// have.
export function plotStepRequired(step: PlotStep): boolean {
  return step === 'name' || step === 'crop';
}

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
  // **Steps that already carry an answer and are therefore not asked.** The
  // unit is always one of them: it is a farm setting, decided once in Settings,
  // and re-asking it on every plot is precisely the "too many clicks" that
  // docs/open-items.md is complaining about. Nothing here is hidden -- the
  // review shows every value before anything is written, and one tap on the
  // unit tile opens the grid that changes it.
  prefilled: readonly PlotStep[];
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
    prefilled: [],
  };
}

// **The plot's own unit is carried, and it overrides the farm setting.** A plot
// recorded in hectares on a farm that has since switched to dunams keeps its
// hectares: the stored number means nothing without the unit it was measured
// in, and quietly relabelling 4 hectares as 4 dunams would be a data change
// disguised as a form default.
//
// cropName comes in as a second argument because it is not a field of the plot
// row -- it lives on the plot's current crop_cycle, which the caller has loaded
// alongside it. '' is the honest value for a plot that somehow has no cycle, and
// the crop step then reads as unanswered rather than as answered with nothing.
export function plotDraftFromPlot(plot: Plot, cropName: string | null): PlotDraft {
  return {
    mode: 'edit',
    name: plot.name,
    area: plot.area,
    areaUnit: plot.areaUnit,
    cropName: cropName ?? '',
    prefilled: [],
  };
}

// The steps this draft will actually put on screen, review included. The
// counter over each question is read off it, and so is every "what comes next"
// answer below, so the three cannot disagree.
// **Every step is on both walks now, create and edit alike.** The crop used to
// be dropped on an edit; merging the two edit buttons into one put it back. See
// the crop entry in the field-by-field table at the top of this file.
export function plotVisibleSteps(draft: PlotDraft): readonly PlotStep[] {
  return PLOT_STEPS.filter((step) => step === 'review' || !draft.prefilled.includes(step));
}

export function nextPlotStep(current: PlotStep, draft: PlotDraft): PlotStep {
  const visible = plotVisibleSteps(draft);
  const index = visible.indexOf(current);
  // A step that is not on the walk -- the unit, always, reached by tapping its
  // tile on the review -- has no "next" of its own. The review is where it came
  // from and the review is where it goes back to.
  if (index === -1 || index === visible.length - 1) return 'review';
  return visible[index + 1] ?? 'review';
}

export function previousPlotStep(current: PlotStep, draft: PlotDraft): PlotStep | null {
  const visible = plotVisibleSteps(draft);
  const index = visible.indexOf(current);
  if (index <= 0) return null;
  return visible[index - 1] ?? null;
}

// One-based, for the caption over each question. It counts what plotVisibleSteps
// will actually put on screen and nothing else, so a step that is prefilled and
// therefore never asked is not counted -- a progress bar that counts a screen
// nobody will see is worse than no bar.
//
// (This used to say an edit is shorter than a create "because the crop step is
// not on it". That stopped being true when the two edit buttons were merged and
// the crop went back onto both walks; the sentence is corrected rather than
// deleted because it was read as licence to drop the crop name from the save.)
export function plotStepPosition(
  current: PlotStep,
  draft: PlotDraft,
): { index: number; total: number } {
  const visible = plotVisibleSteps(draft);
  const index = visible.indexOf(current);
  return { index: index === -1 ? visible.length : index + 1, total: visible.length };
}

// ============================================================
// Reading the two answers this flow still types.
// ============================================================

// null is "no area", which is a real plot -- plots.area is nullable and the
// form has always accepted an empty box. undefined is "what is in the box is
// not a number", which must not quietly become a plot with no area. The same
// three-way convention as parseSprayPhiDaysInput, and the same reason.
//
// **The comma is replaced because a Hebrew keyboard's decimal separator is a
// comma**, and `Number('40,5')` is NaN. The old form did this replacement too;
// what it did not do was notice the NaN, so "abc" was written as a null area
// with no word said. Now the step refuses to advance and says why.
export function parsePlotAreaInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

// What a number field should show when it is opened on an existing value.
// String(area) and not a formatted one: formatNumber inserts a thousands
// separator, and a separator that is then read back by parsePlotAreaInput is a
// number the farmer cannot re-save.
export function plotAreaInputText(area: number | null): string {
  return area === null ? '' : String(area);
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
// The crop is now required on an edit too, because an edit now asks for it: a
// walk that shows the field and then saves it away as empty would be worse than
// one that never showed it.
export function plotFormBlocker(draft: PlotDraft): PlotFormBlocker | null {
  if (!draft.name.trim()) return 'nameRequired';
  if (!draft.cropName.trim()) return 'cropNameRequired';
  return null;
}

// **Every field the old form wrote is still written, unchanged.** name, area
// and area_unit on plots; name and the current year as season on the plot's
// first crop_cycle, which createPlot builds itself. Entering them as tiles
// changes nothing about what is stored.
export function plotCreateInput(draft: PlotDraft, farmAreaUnit: AreaUnit | null): CreatePlotInput {
  return {
    name: draft.name.trim(),
    area: draft.area,
    areaUnit: plotAreaUnit(draft, farmAreaUnit),
    cropName: draft.cropName.trim(),
  };
}

export function plotUpdateInput(draft: PlotDraft, farmAreaUnit: AreaUnit | null): UpdatePlotInput {
  return {
    name: draft.name.trim(),
    area: draft.area,
    areaUnit: plotAreaUnit(draft, farmAreaUnit),
  };
}
