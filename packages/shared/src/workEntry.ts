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
//                         and then written onto the row. It is never recomputed
//                         later from the current rate. See the header of
//                         20260906120000_work_hours.sql: a rate is history, not
//                         a value, and one mutable rate would rewrite the cost
//                         of every job ever recorded the day it is raised.
//
//   manual entry wins     The total stays typable with no hours and no rate at
//                         all. `workCostEdited` is what keeps a typed total from
//                         being overwritten the next time the hours are nudged.
//
//   it lives here         Neither client has a test runner (frontend/mobile has
//                         none at all, and the web components are not under
//                         vitest), so what can be decided away from a screen is
//                         decided here and tested. What stays in a component is
//                         rendering and touch.
//
// **Nothing here imports react or supabase-js.** The hooks that read and write
// these columns live in logEntries.ts, exactly as useSprayCosts does.

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

// Whether a saved cost was typed by hand rather than computed.
//
// Asked when an entry is reopened for editing. A stored total that equals hours
// x rate was computed and may recompute freely; anything else was the farmer's
// own number, and treating it as computed would silently overwrite him the
// moment he corrected the hours. Same rule sprayDraftFromEntry applies to a
// spray, in one tested place so the two clients cannot disagree about it.
export function workCostEdited(
  cost: number | null,
  hours: number | null,
  hourlyRate: number | null,
): boolean {
  return cost !== null && cost !== computeWorkCost(hours, hourlyRate);
}

// The cost that should be on screen now: the farmer's own number once he has
// typed one, otherwise hours x rate.
export function recomputedWorkCost(
  cost: number | null,
  hours: number | null,
  hourlyRate: number | null,
  edited: boolean,
): number | null {
  return edited ? cost : computeWorkCost(hours, hourlyRate);
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
// ============================================================

export type WorkLogRow = {
  workHours: number | null;
  workCost: number | null;
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
    const rowCost = usableAmount(row.workCost);
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
