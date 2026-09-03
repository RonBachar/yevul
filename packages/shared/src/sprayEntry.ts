// Writing a spray as a walk through tiles, one question per screen.
//
// **The founder's words, and they are a rule rather than a preference:** every
// place in this app where a farmer enters data should be squares. Large,
// tappable, two to a row. And on what exists today, "the options are in a
// sliding strip, that is the single most uncomfortable thing about the
// experience, simply appalling". He is describing the horizontal chip
// ScrollViews in LogEntrySheet: a row of options where all but the first two
// are off screen, with nothing on screen saying so.
//
// This module is the part of that pattern that can be decided away from a
// screen. **frontend/mobile has no test runner**, so anything left inside a
// component is untested — the same constraint that put sheetDrag.ts, refresh.ts
// and voiceConfirm.ts here. What lives here: which tiles each step offers,
// where they come from, which steps get asked at all, what blocks the save, and
// what the picked values become for createLogEntry. What stays in the component:
// rendering and touch.
//
// **Nothing here imports react or supabase-js.** LogEntry and LogEntryInput are
// type-only imports and are erased at compile time, exactly as voiceConfirm.ts
// keeps them.
//
// ============================================================
// Where a tile comes from, per field, because the answer is different for each
// and the difference is the whole design.
//
//   pest, material   The farm's own history. prd.md section 8 already required
//                    this ("the material and pest names are suggested from the
//                    farm's history, so they are not typed again every time"),
//                    and useSpraySuggestions already gathered it from the last
//                    50 spray rows. The founder's sketch says the same thing in
//                    his words: "this screen fills up slowly according to what
//                    the farmer chose". So these two grids are not seeded and
//                    not guessed — they are what he sprayed before.
//
//   dose             Also history, but **narrowed to the material first**. A
//                    dose is a property of the can, not of the farmer: whatever
//                    he used with Confidor last time is the answer he wants
//                    again. There is no sensible preset ladder here, because
//                    the column is free text and holds "50 cc", "0.5%" and "2
//                    litres" alike, so an invented list would be noise. An
//                    empty grid is therefore a real state, and it carries a
//                    "no dose" tile so it is never a dead end.
//
//   phiDays          History for this material first, then a small ladder of
//                    the intervals that actually appear on labels. This is the
//                    one field where a preset is honest: the number is a whole
//                    number of days, it comes off a printed label, and the same
//                    handful of values covers most of them. It is also the
//                    field that must never be guessed silently, so it keeps an
//                    explicit "not known" tile — leaving it out is a legitimate
//                    record (the column is nullable), and inventing a waiting
//                    period is not.
//
//   plot             usePlots. A closed, known list, so every plot is a tile
//                    and there is no "add" — creating a plot is a form with a
//                    name, an area and a crop, and it does not belong in the
//                    middle of writing a spray.
//
//   date             Three tiles, today / yesterday / the day before, plus a
//                    way in to any other date. A spray gets written the evening
//                    it happened or the morning after; anything older is rare
//                    enough to pay two number boxes for. The three are built
//                    with formatLocalDateOnly and never with toISOString --
//                    that shifted every hand-picked date in this app a day
//                    early, and a spray date is what safeHarvestDate turns into
//                    the regulatory answer.
// ============================================================

import type { LogEntry, LogEntryInput } from './logEntries';
import { formatLocalDateOnly } from './safeHarvestDate';

// ============================================================
// The history the tiles are read out of.
//
// A flat list of names cannot answer "what dose did he use with this material",
// so useSpraySuggestions hands the rows over as well and every builder below is
// a pure function of them. Newest first, which is the order the query returns
// and the order every "most recent wins" rule here depends on.
// ============================================================

export type SprayHistoryRow = {
  pest: string | null;
  material: string | null;
  dose: string | null;
  phiDays: number | null;
};

// Six value tiles is three rows of two, which is what fits above the fold of a
// bottom sheet with a title over it. The founder asked for no scrolling; this
// is the number that keeps that promise on a small phone.
export const SPRAY_TILE_LIMIT = 6;

// Four rather than six, because this grid carries two extra tiles of its own
// ("another number" and "not known") and would otherwise run to four rows.
export const SPRAY_PHI_TILE_LIMIT = 4;

// The intervals printed on pesticide labels, in the order a farmer meets them.
// A ladder and not a guess: it only ever fills the grid up to the limit after
// this farm's own values have taken their places.
export const SPRAY_PHI_PRESET_DAYS: readonly number[] = [3, 7, 14, 21];

// Trimmed, de-duplicated, newest first, capped. The one list rule the pest,
// material and dose grids all share, and the rule useSpraySuggestions itself
// now uses so that there is a single definition of "recent values" rather than
// one per grid.
export function recentValues(values: readonly (string | null)[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

export function sprayPestOptions(
  rows: readonly SprayHistoryRow[],
  limit: number = SPRAY_TILE_LIMIT,
): string[] {
  return recentValues(
    rows.map((row) => row.pest),
    limit,
  );
}

export function sprayMaterialOptions(
  rows: readonly SprayHistoryRow[],
  limit: number = SPRAY_TILE_LIMIT,
): string[] {
  return recentValues(
    rows.map((row) => row.material),
    limit,
  );
}

function sameMaterial(row: SprayHistoryRow, material: string | null): boolean {
  if (material === null) return false;
  const wanted = material.trim();
  return wanted !== '' && row.material?.trim() === wanted;
}

// **This material's doses first, then the farm's other doses.** Both halves
// earn their place: the first is almost always the answer, and the second is
// what a farmer reaches for when he is spraying something new with a strength
// he already knows in his hands ("half a percent"). Sorting rather than
// filtering, because filtering to the material alone leaves a first-ever use of
// a material with an empty grid it did not have to have.
export function sprayDoseOptions(
  rows: readonly SprayHistoryRow[],
  material: string | null,
  limit: number = SPRAY_TILE_LIMIT,
): string[] {
  const forMaterial = rows.filter((row) => sameMaterial(row, material)).map((row) => row.dose);
  const rest = rows.filter((row) => !sameMaterial(row, material)).map((row) => row.dose);
  return recentValues([...forMaterial, ...rest], limit);
}

// Same shape as the doses, with the label ladder appended so that a farm with
// no history still gets a grid instead of a keyboard. Whole days only:
// safeHarvestDate truncates anyway, and half a day of waiting is not a thing a
// label states.
export function sprayPhiOptions(
  rows: readonly SprayHistoryRow[],
  material: string | null,
  limit: number = SPRAY_PHI_TILE_LIMIT,
): number[] {
  const ordered = [
    ...rows.filter((row) => sameMaterial(row, material)),
    ...rows.filter((row) => !sameMaterial(row, material)),
  ].map((row) => row.phiDays);

  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of [...ordered, ...SPRAY_PHI_PRESET_DAYS]) {
    if (value === null || !Number.isFinite(value)) continue;
    const days = Math.trunc(value);
    if (days < 0 || seen.has(days)) continue;
    seen.add(days);
    result.push(days);
    if (result.length >= limit) break;
  }
  return result;
}

// ============================================================
// What this farm already knows about a material.
//
// **The two halves are answered independently and on purpose.** The most recent
// row for a material may carry a dose and no waiting period, while an older one
// carries the waiting period; taking both from a single row would throw away a
// value the farm has. Each field takes the newest row that actually states it.
// ============================================================

export type SprayMaterialMemory = { dose: string | null; phiDays: number | null };

export function sprayMaterialMemory(
  rows: readonly SprayHistoryRow[],
  material: string | null,
): SprayMaterialMemory {
  const mine = rows.filter((row) => sameMaterial(row, material));
  const dose = mine.map((row) => row.dose?.trim()).find((value) => !!value) ?? null;
  const phiDays =
    mine
      .map((row) => row.phiDays)
      .find((value) => value !== null && Number.isFinite(value) && value >= 0) ?? null;
  return { dose, phiDays: phiDays === null ? null : Math.trunc(phiDays) };
}

// ============================================================
// The plot tiles.
//
// The whole-farm tile is last and is always offered. Last because a spray is
// almost always on a plot and the plots are what he is looking for; always
// because log_entries.plot_id is nullable and "the whole farm" is a real
// answer, not a fallback for an empty list.
// ============================================================

export type SprayPlotOption = { plotId: string | null; name: string | null };

export function sprayPlotOptions(
  plots: readonly { id: string; name: string }[],
): SprayPlotOption[] {
  return [
    ...plots.map((plot) => ({ plotId: plot.id, name: plot.name })),
    { plotId: null, name: null },
  ];
}

// ============================================================
// The date tiles.
//
// labelKey rather than a label: the strings live in i18n.ts and this module
// stays testable without one. Built by walking a local Date back a day at a
// time and reading it with formatLocalDateOnly, which is the counterpart of the
// ban on toISOString written out at the bottom of safeHarvestDate.ts.
// ============================================================

export type SprayDateOption = { date: string; labelKey: string };

const SPRAY_DATE_LABEL_KEYS = ['spray.date.today', 'spray.date.yesterday', 'spray.date.dayBefore'];

export function sprayDateOptions(now: Date): SprayDateOption[] {
  return SPRAY_DATE_LABEL_KEYS.map((labelKey, daysBack) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    return { date: formatLocalDateOnly(day), labelKey };
  });
}

// ============================================================
// The walk.
//
// Six questions in the order the founder listed them, then a review. The review
// is not decoration and it is what pays for the skipping below: every value
// that is about to be written is on it as a tile, and one tap on any of them
// goes back to the screen that set it.
// ============================================================

export type SprayStep = 'pest' | 'material' | 'dose' | 'phiDays' | 'plot' | 'date' | 'review';

export const SPRAY_STEPS: readonly SprayStep[] = [
  'pest',
  'material',
  'dose',
  'phiDays',
  'plot',
  'date',
  'review',
];

const SPRAY_STEP_TITLE_KEYS: Record<SprayStep, string> = {
  pest: 'spray.step.pest',
  material: 'spray.step.material',
  dose: 'spray.step.dose',
  phiDays: 'spray.step.phiDays',
  plot: 'spray.step.plot',
  date: 'spray.step.date',
  review: 'spray.step.review',
};

export function sprayStepTitleKey(step: SprayStep): string {
  return SPRAY_STEP_TITLE_KEYS[step];
}

// The field label each value is filed under on the review screen. Existing keys
// on purpose: these are the same six fields the manual sheet has always named,
// and a second set of strings for them would be two wordings of one field.
const SPRAY_STEP_FIELD_KEYS: Record<SprayStep, string> = {
  pest: 'log.form.sprayPest',
  material: 'log.form.sprayMaterial',
  dose: 'log.form.sprayDose',
  phiDays: 'log.form.sprayPhiDays',
  plot: 'plots.form.name',
  date: 'log.form.date',
  review: 'spray.step.review',
};

export function sprayStepFieldKey(step: SprayStep): string {
  return SPRAY_STEP_FIELD_KEYS[step];
}

// **Required means createLogEntry refuses without it, and nothing else.** Pest
// and material are the two it refuses on (sprayValidationError in
// logEntries.ts). Dose and the waiting period are nullable columns, the plot is
// nullable, and the date always carries today. Marking anything else required
// here would invent a rule the write does not have.
export function sprayStepRequired(step: SprayStep): boolean {
  return step === 'pest' || step === 'material';
}

export type SprayDraft = {
  pest: string | null;
  material: string | null;
  dose: string | null;
  phiDays: number | null;
  plotId: string | null;
  date: string;
  // **Steps that already carry an answer and are therefore not asked.** Two
  // things land here, and both mean the same thing to the walk: a value the
  // farm already knows for this material, and the plot the screen was already
  // filtered to when the sheet opened. Neither is hidden — the review shows
  // every one of them before anything is written.
  prefilled: readonly SprayStep[];
};

export function newSprayDraft(now: Date, defaultPlotId: string | null): SprayDraft {
  return {
    pest: null,
    material: null,
    dose: null,
    phiDays: null,
    plotId: defaultPlotId,
    date: formatLocalDateOnly(now),
    // A farmer who filtered the spray log to a plot and then pressed "new
    // spray" has already answered "which plot". Asking again is the kind of
    // step docs/open-items.md is complaining about under "too many clicks".
    prefilled: defaultPlotId === null ? [] : ['plot'],
  };
}

// Editing an existing record opens on the review, so the draft is complete from
// the start and nothing is prefilled in the "skip it" sense.
//
// **The date is passed through as the string it already is.** log_entries.date
// is a Postgres date column and arrives as YYYY-MM-DD; putting it through a
// Date and back is exactly the round trip that shifted dates a day early.
export function sprayDraftFromEntry(entry: LogEntry): SprayDraft {
  return {
    pest: entry.sprayPest,
    material: entry.sprayMaterial,
    dose: entry.sprayDose,
    phiDays: entry.sprayPhiDays,
    plotId: entry.plotId,
    date: entry.date,
    prefilled: [],
  };
}

// **Picking a material re-decides the dose and the waiting period, always.**
// Both belong to the material rather than to the spray, so carrying a dose
// across a change of material would write a strength that was never used with
// it. When the farm has no memory of the material the two are cleared and the
// walk asks for them, which is the first-ever-use case behaving exactly like a
// first run.
export function applySprayMaterial(
  draft: SprayDraft,
  material: string,
  rows: readonly SprayHistoryRow[],
): SprayDraft {
  const memory = sprayMaterialMemory(rows, material);
  const prefilled = draft.prefilled.filter((step) => step !== 'dose' && step !== 'phiDays');
  return {
    ...draft,
    material,
    dose: memory.dose,
    phiDays: memory.phiDays,
    prefilled: [
      ...prefilled,
      ...(memory.dose === null ? [] : (['dose'] as const)),
      ...(memory.phiDays === null ? [] : (['phiDays'] as const)),
    ],
  };
}

// The steps this draft will actually put on screen, review included. The
// counter over each grid is read off it, and so is every "what comes next"
// answer below, so the three cannot disagree.
export function sprayVisibleSteps(draft: SprayDraft): readonly SprayStep[] {
  return SPRAY_STEPS.filter((step) => step === 'review' || !draft.prefilled.includes(step));
}

export function nextSprayStep(current: SprayStep, draft: SprayDraft): SprayStep {
  const visible = sprayVisibleSteps(draft);
  const index = visible.indexOf(current);
  // A step that is not on the walk (the plot, when the screen already knew it,
  // reached by tapping its tile on the review) has no "next" of its own. The
  // review is where it came from and the review is where it goes back to.
  if (index === -1 || index === visible.length - 1) return 'review';
  return visible[index + 1] ?? 'review';
}

export function previousSprayStep(current: SprayStep, draft: SprayDraft): SprayStep | null {
  const visible = sprayVisibleSteps(draft);
  const index = visible.indexOf(current);
  if (index <= 0) return null;
  return visible[index - 1] ?? null;
}

// One-based, for the caption over each grid. The total moves when a material
// with a remembered dose is picked, which is the point: the walk really did get
// shorter, and saying so is better than a progress bar that lies.
export function sprayStepPosition(
  current: SprayStep,
  draft: SprayDraft,
): { index: number; total: number } {
  const visible = sprayVisibleSteps(draft);
  const index = visible.indexOf(current);
  return { index: index === -1 ? visible.length : index + 1, total: visible.length };
}

// ============================================================
// What stops the save, and what the save writes.
// ============================================================

export type SprayEntryBlocker = 'pestRequired' | 'materialRequired';

export const SPRAY_BLOCKER_MESSAGE_KEYS: Record<SprayEntryBlocker, string> = {
  pestRequired: 'log.form.pestRequired',
  materialRequired: 'log.form.materialRequired',
};

// Asked before the save button is offered rather than after the write comes
// back, for the reason voiceRecordBlocker exists: an error a farmer can do
// nothing about, on a screen with no field for it, is the worst place to be
// told. It deliberately mirrors sprayValidationError rather than sharing it —
// that one enumerates the write's failure reasons and belongs to the write —
// and a test holds the two to the same answer.
export function sprayEntryBlocker(draft: SprayDraft): SprayEntryBlocker | null {
  if (!draft.pest?.trim()) return 'pestRequired';
  if (!draft.material?.trim()) return 'materialRequired';
  return null;
}

// **The four regulatory fields go in exactly as before.** safeHarvestDate reads
// the date and the waiting period, and prd.md appendix a.3 makes that the
// calculation this product exists to get right. Nothing about entering them as
// tiles changes what is stored.
export function sprayEntryInput(draft: SprayDraft): LogEntryInput {
  return {
    plotId: draft.plotId,
    date: draft.date,
    type: 'spray',
    // Not asked by this flow. The founder named six fields and a note is not
    // one of them; the manual sheet still has it for every other entry type.
    // On an edit the existing note is preserved by the caller, which is why
    // this is null rather than a silent erase — see the sheet.
    note: null,
    sprayPest: draft.pest?.trim() ? draft.pest.trim() : null,
    sprayMaterial: draft.material?.trim() ? draft.material.trim() : null,
    sprayDose: draft.dose?.trim() ? draft.dose.trim() : null,
    sprayPhiDays: draft.phiDays,
    harvestQty: null,
    harvestUnit: null,
  };
}

// ============================================================
// Reading what a farmer typed into the one field this flow ever shows.
//
// Same convention as parseVoicePhiDaysInput, and for the same reason: an empty
// box is a spray with no stated waiting period, which is a real record, while
// an unreadable box must not quietly become one.
// ============================================================

export function parseSprayPhiDaysInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}
