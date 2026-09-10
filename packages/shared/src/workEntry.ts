// The material half of the entry's cost, borrowed rather than restated: the same
// function the spray flow uses, so a spray's contribution to the one total below
// cannot be computed two ways. See computeEntryCost.
import { computeSprayCost, recentValues } from './sprayEntry';

// Work hours on a journal entry, and what they cost.
//
// Ido, 2026-09-06: "let me enter how many hours the job took and the cost per
// work hour. Work hours plus materials, with fixed prices I enter once, and the
// app knows how to compute the costs." His example is a spray that also took him
// three hours, which is why hours are not a spray field: they belong to any
// entry, because tilling, pruning and a repair take hours just the same.
//
// **This module is the labour twin of the material pricelist**, and everything
// structural about it is copied on purpose from sprayEntry.ts:
//
//   the cost is frozen    hours x rate is computed while the farmer is typing
//                         and then written as the amount of the expense the entry
//                         creates. It is never recomputed later from the current
//                         rate. See the header of 20260906120000_work_hours.sql:
//                         a rate is history, not a value, and one mutable rate
//                         would rewrite the cost of every job ever recorded the
//                         day it is raised.
//
//   manual entry wins     The total stays typable with no hours and no rate at
//                         all. `entryCostEdited` is what keeps a typed total from
//                         being overwritten the next time the hours are nudged.
//
//   it lives here         Neither client has a test runner (frontend/mobile has
//                         none at all, and the web components are not under
//                         vitest), so what can be decided away from a screen is
//                         decided here and tested. What stays in a component is
//                         rendering and touch.
//
// **Where the money goes changed on 2026-09-10, and what is computed here did
// not.** `log_entries.work_cost` is gone; a journal entry that carries a cost
// writes one expense and the amount of that expense is the whole of what the entry
// cost -- material and hours together. So the labour figure below is no longer a
// column, it is one half of the suggestion the farmer is offered for that single
// total (computeEntryCost). Everything about how it is computed, frozen and
// overridden is unchanged. See the money header in logEntries.ts.
//
// **Nothing here imports react or supabase-js.** The hooks that read and write
// these columns live in logEntries.ts.

// Reading a number the farmer typed into the hours, rate or cost box.
//
// Deliberately the same function the spray cost boxes use rather than a second
// copy of it: an empty box is "not stated" (null) and an unreadable box must not
// quietly become one (undefined). Aliased so a work-hours call site does not
// have to read the word "spray" to parse an hour.
export { parseSprayAmountInput as parseWorkAmountInput } from './sprayEntry';

// Hours times the hourly rate, or null when either is missing or unusable. Null
// is a real state: an entry with no labour cost, or a cost the farmer will type
// directly. The sibling of computeSprayCost, held to the same rules by a test.
export function computeWorkCost(hours: number | null, hourlyRate: number | null): number | null {
  if (hours === null || hourlyRate === null) return null;
  if (!Number.isFinite(hours) || !Number.isFinite(hourlyRate)) return null;
  if (hours < 0 || hourlyRate < 0) return null;
  return hours * hourlyRate;
}

// **`workCostEdited` and `recomputedWorkCost` are gone, deliberately.** They asked
// whether a *stored labour cost* had been typed by hand, and there is no stored
// labour cost any more -- one entry has one cost and it is the amount of its
// expense. Keeping them would have left two ways to ask one question, each right
// about half a number. `entryCostEdited` and `recomputedEntryCost` below are the
// replacements, and they ask it about the whole.

// ============================================================
// What the work actually was.
//
// Ido's first feedback round, item (ו): "שעות עבודה וסוג עבודה ביומן". The hours
// shipped in 20260906120000_work_hours.sql; this is the other half of that
// sentence, and the founder decided on 2026-09-10 how to answer it.
//
// **A free-text field of its own, and `type` stays the closed list it is.** When
// Ido logs three hours of pruning he picks "אחר", because the ten types are a
// domain rather than a label and there is nowhere in them to say what he did.
// The obvious fix -- let him type into `type` -- was rejected: the Spray Log
// Screen filters `type = 'spray'` in the database and the regulator export is
// that filtered list, so one typo would drop a real spray out of a regulatory
// document silently. Two questions, two fields. See the header of
// 20260910130000_work_kind.sql, which carries the argument in full.
//
// **The grid is a convenience and never a list.** He types "גיזום" once and taps
// it every time after; he can also type something no farm has ever typed, on any
// entry, forever. Manual entry always wins -- the standing founder rule this
// product applies to every cost box, every material and every expense name.
// ============================================================

// **Five, matching EXPENSE_NAME_TILE_LIMIT rather than the six of the spray
// grids, and for that same reason.** The spray and crop grids own a whole step
// of a walk and can afford a fourth row; this field sits on the journal sheet
// underneath a type strip, a date, a note, the hours, the rate and a cost box.
// Five values plus a "something else" square is exactly three full rows. If the
// sheet turns out too tall on a phone, this number is the cheap lever, not the
// grid itself -- the same note expenseForm.ts leaves.
export const WORK_KIND_TILE_LIMIT = 5;

// **recentValues, and newest-first rather than most-used.** Three reasons, and
// the first is the one that decided it:
//
//   seasonality  Farm work is seasonal. Pruning happens for a few weeks in
//                winter and harvest for a few weeks in summer, so a most-used
//                ranking, built over a whole year, would keep offering January's
//                work in August -- it gets *worse* the longer the farm uses the
//                product, which is the wrong direction for a shortcut to move.
//                Newest-first tracks the season the farmer is actually standing
//                in.
//
//   one rule     recentValues is already what the pest, material, dose, crop and
//                expense-name grids all use. A sixth grid with a ranking of its
//                own would mean a fix to "what this farm did recently" could land
//                in five places and miss the sixth.
//
//   the window   The read is capped at fifty rows anyway (useWorkKindSuggestions),
//                so "most used" would in truth be "most used in the last fifty
//                entries" -- a frequency count over a recency window, which is
//                the same idea as recency with an extra step that is harder to
//                explain and harder to test.
//
// `selected` is the value the sheet is currently holding, on the grid whether or
// not the history still remembers it -- identical to expenseNameOptions, and for
// the identical reason: reopening a six-month-old entry whose kind of work has
// since dropped off the end of the last fifty rows must not look like the value
// got lost.
export function workKindOptions(
  kinds: readonly (string | null)[],
  selected: string | null = null,
  limit: number = WORK_KIND_TILE_LIMIT,
): string[] {
  const recent = recentValues(kinds, limit);
  const current = selected?.trim();
  if (!current || recent.includes(current)) return recent;
  return [current, ...recent].slice(0, limit);
}

// ============================================================
// What a journal entry cost, as one number.
//
// **One entry, one cost, one expense.** Founder's decision 2026-09-10: a journal
// entry that carries a cost writes a single expense, and its amount is what the
// entry cost in total. Ido's words are the argument -- he wants to know what the
// spray cost him, and that is one number, not a material line and a labour line he
// has to add up himself. The two halves stay on the journal row as the record of
// how the number was reached; they are not two figures the profit screen subtracts.
//
// So the suggestion offered for that one box is the material cost plus the labour
// cost, and this is where the two are added. It lives in this file rather than in
// sprayEntry.ts because sprayEntry.ts knows nothing about hours, while this one
// already borrows computeSprayCost.
// ============================================================

// Quantity x unit price, plus hours x rate. Null when neither half can be
// computed, which is the ordinary state of an entry with no cost at all --
// distinct from 0, which would be the claim that the job was free.
//
// **A half that cannot be computed is skipped, not treated as zero.** A spray with
// a material cost and no stated hours suggests the material cost, and vice versa.
// Only when both are missing is there nothing to suggest.
export function computeEntryCost(
  quantity: number | null,
  unitPrice: number | null,
  hours: number | null,
  hourlyRate: number | null,
): number | null {
  const material = computeSprayCost(quantity, unitPrice);
  const labour = computeWorkCost(hours, hourlyRate);
  if (material === null && labour === null) return null;
  return (material ?? 0) + (labour ?? 0);
}

// Whether a saved cost was typed by hand rather than computed.
//
// Asked when an entry is reopened for editing. A stored total that equals the
// computed suggestion may recompute freely; anything else was the farmer's own
// number, and treating it as computed would silently overwrite him the moment he
// corrected the hours or the quantity. **This is the standing "manual entry always
// wins" rule of this product** -- a farmer with no material, no quantity, no hours
// and no rate can type a total and it stays exactly as typed.
//
// It replaces workCostEdited and sprayDraftFromEntry's inline comparison, which
// asked the same question of one half each while there were two stored costs.
export function entryCostEdited(
  cost: number | null,
  quantity: number | null,
  unitPrice: number | null,
  hours: number | null,
  hourlyRate: number | null,
): boolean {
  return cost !== null && cost !== computeEntryCost(quantity, unitPrice, hours, hourlyRate);
}

// The cost that should be on screen now, for the one cost box: the farmer's own
// number once he has typed one, otherwise the computed suggestion.
export function recomputedEntryCost(
  cost: number | null,
  quantity: number | null,
  unitPrice: number | null,
  hours: number | null,
  hourlyRate: number | null,
  edited: boolean,
): number | null {
  return edited ? cost : computeEntryCost(quantity, unitPrice, hours, hourlyRate);
}

// ============================================================
// The work-hours view.
//
// Ido: "I don't see a work-hours journal at all." The totals under that list are
// the answer to the question he actually asked -- how much did the work cost me
// -- so they are computed here and tested, and the screen only prints them.
//
// **Hours and money are summed independently, and neither implies the other.**
// An entry can carry three hours with no cost (a farm that has never stated a
// rate) or a cost with no hours (a lump sum typed straight in). Deriving one
// total from the other would invent a number in both cases.
//
// **The cost per row is now the entry's whole cost, off its expense, and not a
// labour column.** Since 2026-09-10 there is no `work_cost` to read. A spray that
// also took three hours therefore contributes its whole cost to this screen's
// total, material included -- which is what that day of work actually cost, and
// there is no second figure anywhere for it to be double counted against.
// ============================================================

export type WorkLogRow = {
  workHours: number | null;
  cost: number | null;
};

export type WorkLogTotals = {
  // Entries that carry hours, a cost, or both. The count of what is on screen,
  // not of the farm's whole journal.
  entries: number;
  hours: number;
  cost: number;
};

export function workLogTotals(rows: readonly WorkLogRow[]): WorkLogTotals {
  let entries = 0;
  let hours = 0;
  let cost = 0;
  for (const row of rows) {
    const rowHours = usableAmount(row.workHours);
    const rowCost = usableAmount(row.cost);
    if (rowHours === null && rowCost === null) continue;
    entries += 1;
    hours += rowHours ?? 0;
    cost += rowCost ?? 0;
  }
  return { entries, hours, cost };
}

// A stored number that can be added up. NaN and Infinity cannot reach these
// columns through the app, but a total is the one place where a single bad row
// would poison every number on the screen, so they are dropped rather than
// summed.
function usableAmount(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value;
}
