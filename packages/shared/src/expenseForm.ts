// Writing an expense: one sheet, and the one field that repeats became squares.
//
// **The third rollout of the tile pattern, and the first one that is not a
// walk.** SprayEntrySheet and PlotFormScreen both became a question per screen,
// and both were shown to the founder on a device and approved. This one is
// deliberately not that, and the reason is frequency rather than taste.
//
// ============================================================
// The taps, counted, because that is what decided it.
//
// An expense is the highest-frequency action in the product -- a spray is logged
// occasionally and a plot is added a handful of times a year -- and "too many
// clicks" is a standing complaint in docs/open-items.md. So the two candidate
// designs were counted rather than argued about. Three cases, on the phone,
// from the moment "new expense" is pressed to the moment it is saved:
//
//   (i)   a name this farm has used before, an amount, today's date, no note
//   (ii)  the same, but the receipt is from last week
//   (iii) a name this farm has never used, an amount, today's date, no note
//
//                              (i)      (ii)     (iii)   keyboard fields
//   the one-page form at HEAD   3        4        3       2
//   a stepped walk              4        6        5       1
//   one sheet, name as tiles    4        5        4       1
//
// **The walk loses on the count, and it loses worst on the case that is
// actually the common one here.** Case (ii) is not the exception on this
// screen: the founder's own reason for taking the today/yesterday shortcuts off
// this date field was that an expense "is usually a receipt found later". A walk
// has to hide the calendar behind a review tile, so every expense that is not
// today's costs two taps to reach a grid that the one sheet simply has on
// screen. The walk also buys a review screen this form does not need -- four
// fields already fit on one sheet, which is the whole reason it was ever a
// sheet and not a screen.
//
// **So the sheet stays one sheet, and gains tiles where tiles help.** That is
// the founder's instruction read as a tool rather than as a quota, exactly the
// way plotForm.ts read it: the name is a grid because a farm buys the same five
// things over and over, and nothing else on the form is.
//
// The one tap the grid costs over HEAD is the same trade the plot form
// documented and it is paid in the same currency: a tap replaces a Hebrew word
// typed on a phone keyboard by a farmer of 65. Case (iii) costs that tap once
// per name the farm has never used; from the second diesel onwards it is a
// square.
// ============================================================
//
// ============================================================
// Which field became tiles, which stayed typed, and why the answer is
// different for each.
//
//   name     **Tiles, from the farm's own expense history.** This is the case
//            useSpraySuggestions established and useCropSuggestions repeated: a
//            farm buys a handful of things and has bought them before -- diesel,
//            fertiliser, pesticide -- so the grid fills up over time from what
//            was actually spent. The source is the farm's own expenses rows,
//            read by useExpenseSuggestions in expenses.ts. First run is an empty
//            grid, which is a real state and is answered with a sentence and an
//            "add a new one" tile rather than a dead end.
//
//   amount   **Typed, and this is the deliberate refusal, for the second time.**
//            The obvious grid is the amounts already spent, and it is wrong for
//            the reason plotForm.ts refused to tile a plot's area: money is the
//            multiplier on the entire picture. Every profit figure the product
//            shows is summed from expenses.amount (profit.ts, reports.ts), so a
//            one-tap plausible-but-wrong number goes straight into the number the
//            farmer is running his season by. Amounts also do not repeat the way
//            names do -- a diesel fill is 380 one week and 412 the next -- so a
//            grid of them would be a list of near misses, which is worse than no
//            grid at all. A number he reads off the receipt, typed once, in a
//            decimal keypad.
//
//   note     **Typed, and it cannot honestly be anything else.** A note is by
//            definition the one-off thing worth saying about this expense, so
//            there is no vocabulary to build a grid out of -- the same argument
//            that kept the plot *name* typed. Optional, and it always was.
//
//   date     **The calendar, untouched.** The founder's correction of
//            2026-09-03: no today/yesterday shortcuts on an expense, straight
//            into the month grid. See the comment on the DateField call in both
//            sheets. Nothing here re-opens it.
//
//   plot     **Not asked, and it never was.** The founder rejected a plot picker
//            and a category picker outright ("אני לא רוצה שיהיו לי אפשרויות, זה
//            מסבך"). plot_id still gets written, always inferred from the
//            context the sheet was opened in. Turning it into squares would be
//            adding the question he removed.
// ============================================================
//
// **Neither frontend/mobile nor frontend/web has a test runner**, which is why
// this is a module and not a hook: what the grid offers, what the box will
// accept as an amount, and what the save actually writes all live here and are
// tested. What stays in the two sheets is rendering, touch, and the receipt.
//
// **Nothing here imports react or supabase-js.** Expense and ExpenseInput are
// type-only imports and are erased at compile time, the same way plotForm.ts
// keeps Plot and sprayEntry.ts keeps LogEntry.

import type { Expense, ExpenseInput } from './expenses';
import { formatLocalDateOnly } from './safeHarvestDate';
import { recentValues } from './sprayEntry';

// ============================================================
// The name tiles.
// ============================================================

// **Five, and not the six every other grid in this app uses.** Six values plus
// the "new name" square is seven tiles, which is a fourth row holding one lonely
// square; five plus the square is exactly three full rows. The other grids own
// a whole screen and can afford the extra row -- this one shares a sheet with an
// amount, a month of days, a note and three buttons, and DateField's header
// already records what happens when squares are stacked into a form that has
// other rows under them.
export const EXPENSE_NAME_TILE_LIMIT = 5;

// **recentValues and not a fourth copy of it.** Trimmed, de-duplicated, newest
// first, capped -- one definition of "what this farm did recently", shared with
// the pest, material, dose and crop grids, so a fix to the rule cannot land in
// one grid and miss another.
//
// `selected` is the value the sheet is currently holding, and it is on the grid
// whether or not the history still remembers it. Without that, opening an
// expense recorded months ago -- whose name has since been pushed off the end of
// the last fifty rows -- would show a grid with nothing selected, which reads as
// a name that got lost. It is prepended rather than appended so that the value
// that is set is the first square, and the grid stays at the same length so that
// the number of rows under the question cannot change.
export function expenseNameOptions(
  names: readonly (string | null)[],
  selected: string | null = null,
  limit: number = EXPENSE_NAME_TILE_LIMIT,
): string[] {
  const recent = recentValues(names, limit);
  const current = selected?.trim();
  if (!current || recent.includes(current)) return recent;
  return [current, ...recent].slice(0, limit);
}

// ============================================================
// The form's state, as one value.
//
// Four fields and a plot that is never asked, which is the whole form. Held as
// a draft rather than as five useStates for the reason SprayDraft and PlotDraft
// are: it is what the tested functions below take, so the two clients cannot
// disagree about what a half-filled expense is.
// ============================================================

export type ExpenseDraft = {
  name: string;
  // **The box's text, and not a number.** "1," and "" are both states a decimal
  // keypad can be in and neither is an amount, so the parse happens once, at the
  // save, where the answer is either a number or a refusal. This is the same
  // split PlotFormScreen keeps between draft.area and its areaText, moved into
  // the draft here because an expense has no step to commit the box at.
  amountText: string;
  // Written, never asked. It comes from the screen the sheet was opened on --
  // the plot's expenses tab passes its plot, the money tab and the capture sheet
  // pass none -- and the farmer never sees a picker for it.
  plotId: string | null;
  date: string;
  note: string;
};

export function newExpenseDraft(now: Date, defaultPlotId: string | null): ExpenseDraft {
  return {
    name: '',
    amountText: '',
    plotId: defaultPlotId,
    // The device's calendar day, never the UTC one. toISOString() is right for
    // most of the day and wrong from local midnight until 02:00 or 03:00, when
    // Israel is on a date UTC has not reached yet.
    date: formatLocalDateOnly(now),
    note: '',
  };
}

// **The date is passed through as the string it already is.** expenses.date is a
// Postgres date column and arrives as YYYY-MM-DD; putting it through a Date and
// back is exactly the round trip that shifted dates a day early, written out at
// the bottom of safeHarvestDate.ts.
//
// String(amount) and not formatAmount: a currency symbol or a thousands
// separator that is then read back by parseExpenseAmountInput is a number the
// farmer cannot re-save. Same rule as plotAreaInputText.
export function expenseDraftFromExpense(expense: Expense): ExpenseDraft {
  return {
    name: expense.name ?? '',
    amountText: String(expense.amount),
    plotId: expense.plotId,
    date: expense.date,
    note: expense.note ?? '',
  };
}

// ============================================================
// Reading the one number this form asks for.
// ============================================================

// undefined and nothing else, because unlike a plot's area there is no such
// thing as an expense with no amount: the column is NOT NULL and the form has
// refused a zero or an empty box since it was built. So this returns a usable
// amount or nothing, and the sheet says `expense.form.amountRequired` either
// way -- an empty box, a zero, a negative and "abc" are all the same answer to
// the farmer, which is "the amount is missing".
//
// **The comma is replaced because a Hebrew keyboard's decimal separator is a
// comma**, and Number('40,5') is NaN. Both sheets already did this replacement;
// what they did not do was share it, so the phone's decimal-pad and the
// browser's number input were two implementations of one rule.
export function parseExpenseAmountInput(text: string): number | undefined {
  const value = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

// ============================================================
// What the save writes.
//
// **Every field the one-page form wrote is still written, unchanged**: amount,
// category (the column `name` is stored in -- see expenses.ts), date and note on
// expenses, and plot_id on the expense_allocations row createExpense and
// updateExpense build themselves. Entering the name as a square changes nothing
// about what is stored, and `source` is not here at all because it is
// createExpense's own defaulted parameter and the sheet has never passed it.
//
// undefined is the one refusal, and it is returned rather than thrown so that
// the guard cannot be forgotten: there is no way to build the write without
// answering the amount question first. It is the same rule
// sprayEntryBlocker and plotFormBlocker state separately, folded into the
// builder here because this form has exactly one blocker.
// ============================================================

export function expenseWriteInput(draft: ExpenseDraft): ExpenseInput | undefined {
  const amount = parseExpenseAmountInput(draft.amountText);
  if (amount === undefined) return undefined;
  return {
    amount,
    name: draft.name.trim() ? draft.name.trim() : null,
    plotId: draft.plotId,
    date: draft.date,
    note: draft.note.trim() ? draft.note.trim() : null,
  };
}
