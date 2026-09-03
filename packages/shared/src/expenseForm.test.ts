// Tests for packages/shared/src/expenseForm.ts, the expense sheet's policy.
//
// **The expense sheet is the third rollout of the tile pattern and the first
// that stayed one sheet**, and the reason is counted in the header of
// expenseForm.ts rather than argued about: a stepped walk costs more taps than
// the form it would replace, and costs the most on the case the founder himself
// called the common one here, a receipt found later.
//
// So what is pinned below is narrower than what plotForm.test.ts pins, because
// there is no walk to pin. Three things: what the name grid offers, what the
// amount box will accept, and -- at the bottom, against createExpense and
// updateExpense themselves -- that entering the name as a square did not change
// a single column of what gets written.
//
// What stays untested is everything locked inside a component. Neither
// frontend/mobile nor frontend/web has a test runner, so the grid's rendering,
// the add-a-name box, the receipt attach button, the receipt viewer and the
// delete confirmation are all verified by reading and not by running.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createExpense, updateExpense, type Expense } from './expenses';
import {
  expenseDraftFromExpense,
  expenseNameOptions,
  expenseWriteInput,
  newExpenseDraft,
  parseExpenseAmountInput,
  EXPENSE_NAME_TILE_LIMIT,
  type ExpenseDraft,
} from './expenseForm';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    farmId: 'farm-1',
    amount: 380,
    name: 'דלק',
    date: '2026-08-27',
    note: 'תחנת דלק בכניסה',
    source: 'manual',
    plotId: 'plot-1',
    receiptPath: null,
    createdAt: '2026-08-27T09:00:00.000Z',
    ...overrides,
  };
}

// A finished draft, the state the save button is looking at.
function ready(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    name: 'דלק',
    amountText: '380',
    plotId: 'plot-1',
    date: '2026-08-27',
    note: 'תחנת דלק בכניסה',
    ...overrides,
  };
}

// ============================================================
// The name grid.
//
// The one field on this sheet that became squares, because it is the one with a
// vocabulary that repeats. The source is the farm's own expenses rows; see
// useExpenseSuggestions in expenses.ts.
// ============================================================

describe('expenseNameOptions', () => {
  it('offers what this farm has bought, newest first, with no duplicates', () => {
    expect(expenseNameOptions(['דלק', 'דשן', 'דלק', 'ריסוס'])).toEqual(['דלק', 'דשן', 'ריסוס']);
  });

  it('trims, and treats a blank or missing name as absent', () => {
    expect(expenseNameOptions(['  דלק  ', '', '   ', null])).toEqual(['דלק']);
  });

  // **Five and not six, and the number is a layout fact rather than a taste.**
  // Five values plus the dashed "new name" square is exactly three full rows of
  // two; six would put a fourth row under the question holding one lonely
  // square, on a sheet that already carries an amount, a month of days, a note
  // and three buttons below the grid.
  it('stops at five, so the grid plus the add square is three full rows', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(EXPENSE_NAME_TILE_LIMIT).toBe(5);
    expect(expenseNameOptions(many)).toHaveLength(5);
    expect(expenseNameOptions(many, null, 2)).toEqual(['a', 'b']);
  });

  // **The first run, and on this screen it is the path a new farm meets first.**
  // A brand new farm has spent nothing, so the grid is empty. That is a real
  // state and the sheet answers it with a sentence (expense.form.emptyNames) and
  // a dashed "new name" square, never a dead end.
  it('is empty on a brand new farm, rather than inventing an expense', () => {
    expect(expenseNameOptions([])).toEqual([]);
  });

  // **Editing an old expense must not look like a name that got lost.** The
  // history is the last fifty rows, so a name from months ago has fallen off it;
  // without this the grid would open with nothing selected on a record that
  // plainly has a name.
  it('keeps the value the sheet is holding on the grid even when the history forgot it', () => {
    expect(expenseNameOptions(['דלק', 'דשן'], 'תיקון משאבה')).toEqual([
      'תיקון משאבה',
      'דלק',
      'דשן',
    ]);
  });

  it('does not show the held value twice when the history still has it', () => {
    expect(expenseNameOptions(['דלק', 'דשן'], 'דשן')).toEqual(['דלק', 'דשן']);
  });

  // The grid stays the same length whether or not a value had to be prepended,
  // so answering the question cannot change the number of rows under it and
  // shift the amount box out from under a thumb.
  it('stays at the limit when a held value is prepended', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(expenseNameOptions(five, 'z')).toEqual(['z', 'a', 'b', 'c', 'd']);
  });

  it('ignores a held value that is blank', () => {
    expect(expenseNameOptions(['דלק'], '   ')).toEqual(['דלק']);
  });
});

// ============================================================
// The draft.
// ============================================================

describe('newExpenseDraft', () => {
  it('opens empty on the local calendar day', () => {
    expect(newExpenseDraft(new Date(2026, 8, 3, 0, 30), null)).toEqual({
      name: '',
      amountText: '',
      plotId: null,
      date: '2026-09-03',
      note: '',
    });
  });

  // **The plot is inferred and never asked**, which is the founder's decision
  // the sheet has carried since it was built: "אני לא רוצה שיהיו לי אפשרויות,
  // זה מסבך". A sheet opened from a plot's expenses tab writes that plot.
  it('carries the plot the sheet was opened on, with no question about it', () => {
    expect(newExpenseDraft(new Date(2026, 8, 3), 'plot-7').plotId).toBe('plot-7');
  });
});

describe('expenseDraftFromExpense', () => {
  it('opens an existing expense on its own values', () => {
    expect(expenseDraftFromExpense(expense())).toEqual({
      name: 'דלק',
      amountText: '380',
      plotId: 'plot-1',
      date: '2026-08-27',
      note: 'תחנת דלק בכניסה',
    });
  });

  // expenses.date is a Postgres date column and arrives as YYYY-MM-DD. Putting
  // it through a Date and back is the round trip that read UTC midnight on a
  // local calendar and showed every hand-picked date a day early.
  it('passes the date through as the string it already is', () => {
    expect(expenseDraftFromExpense(expense({ date: '2026-01-01' })).date).toBe('2026-01-01');
  });

  // Unformatted on purpose: a thousands separator or a currency symbol that is
  // then read back by parseExpenseAmountInput is a number the farmer cannot
  // re-save. Same rule as plotAreaInputText.
  it('opens the amount box on the stored number, unformatted', () => {
    expect(expenseDraftFromExpense(expense({ amount: 12500.5 })).amountText).toBe('12500.5');
  });

  it('reads a nameless or noteless expense as empty boxes rather than nulls', () => {
    const draft = expenseDraftFromExpense(expense({ name: null, note: null }));
    expect(draft.name).toBe('');
    expect(draft.note).toBe('');
  });

  it('carries an expense with no plot through as having none', () => {
    expect(expenseDraftFromExpense(expense({ plotId: null })).plotId).toBeNull();
  });
});

// ============================================================
// The one number this form asks for.
//
// **Typed and never a tile, and that is the deliberate refusal.** Every profit
// figure the product shows is summed from expenses.amount, so a one-tap
// plausible-but-wrong number goes straight into the figure the farmer runs his
// season by -- the same argument that kept a plot's area off the grid.
// ============================================================

describe('parseExpenseAmountInput', () => {
  it('reads a plain number', () => {
    expect(parseExpenseAmountInput('380')).toBe(380);
    expect(parseExpenseAmountInput('  12.5  ')).toBe(12.5);
  });

  // A Hebrew keyboard's decimal separator is a comma, and Number('40,5') is NaN.
  // Both sheets already did this replacement; what they did not do was share it.
  it('accepts a comma where a decimal point belongs', () => {
    expect(parseExpenseAmountInput('40,5')).toBe(40.5);
  });

  // **There is no such thing as an expense with no amount.** The column is NOT
  // NULL and the form has refused an empty box, a zero and a negative since it
  // was built, so all four of these are one answer to the farmer: the amount is
  // missing.
  it('refuses everything that is not a positive number', () => {
    expect(parseExpenseAmountInput('')).toBeUndefined();
    expect(parseExpenseAmountInput('   ')).toBeUndefined();
    expect(parseExpenseAmountInput('0')).toBeUndefined();
    expect(parseExpenseAmountInput('-5')).toBeUndefined();
    expect(parseExpenseAmountInput('abc')).toBeUndefined();
    expect(parseExpenseAmountInput('1.2.3')).toBeUndefined();
  });
});

// ============================================================
// What the save writes.
//
// Nothing about entering the name as a square may change what is stored. These
// are the same four columns on expenses, and the same allocation row, that the
// one-page form wrote.
// ============================================================

describe('expenseWriteInput', () => {
  it('carries the five values through exactly', () => {
    expect(expenseWriteInput(ready())).toEqual({
      amount: 380,
      name: 'דלק',
      plotId: 'plot-1',
      date: '2026-08-27',
      note: 'תחנת דלק בכניסה',
    });
  });

  it('trims the two typed strings', () => {
    expect(expenseWriteInput(ready({ name: '  דשן  ', note: '  חצי שק  ' }))).toMatchObject({
      name: 'דשן',
      note: 'חצי שק',
    });
  });

  // Both columns are nullable, and an empty box has always meant "not said"
  // rather than an empty string sitting in the database.
  it('writes a null rather than an empty string for a missing name or note', () => {
    expect(expenseWriteInput(ready({ name: '   ', note: '' }))).toMatchObject({
      name: null,
      note: null,
    });
  });

  // The refusal is returned rather than thrown, and it is returned by the
  // builder rather than by a separate blocker, so there is no way to build the
  // write without answering the amount question first.
  it('refuses to build a write at all when the amount is not a usable amount', () => {
    expect(expenseWriteInput(ready({ amountText: '' }))).toBeUndefined();
    expect(expenseWriteInput(ready({ amountText: '0' }))).toBeUndefined();
    expect(expenseWriteInput(ready({ amountText: 'abc' }))).toBeUndefined();
  });

  // An edit that changes nothing has to write back exactly what it opened on.
  it('round-trips an existing expense unchanged', () => {
    expect(expenseWriteInput(expenseDraftFromExpense(expense()))).toEqual({
      amount: 380,
      name: 'דלק',
      plotId: 'plot-1',
      date: '2026-08-27',
      note: 'תחנת דלק בכניסה',
    });
  });
});

// ============================================================
// The write path, column by column, against the writes themselves.
//
// The tests above hold the shape of what the sheet hands over. These hold what
// actually reaches the database, because that is the thing this change was not
// allowed to alter: the same four columns on `expenses`, the same `source`
// default, and the same single allocation row carrying the plot the sheet
// inferred.
// ============================================================

type Recorded = { table: string; op: 'insert' | 'update'; values: Record<string, unknown> };

// A supabase client the size of what createExpense and updateExpense actually
// touch, and no larger. It records the writes, because everything worth
// asserting here is about the row that was sent.
function fakeWriteClient() {
  const recorded: Recorded[] = [];
  let table = '';

  const builder = {
    insert(values: Record<string, unknown>) {
      recorded.push({ table, op: 'insert', values });
      return builder;
    },
    update(values: Record<string, unknown>) {
      recorded.push({ table, op: 'update', values });
      return builder;
    },
    eq() {
      return builder;
    },
    is() {
      return builder;
    },
    select() {
      return Promise.resolve({ data: [{ id: 'expense-1' }], error: null });
    },
    // An allocation write is awaited with nothing chained after it, so the
    // builder itself has to settle.
    then(resolve: (value: unknown) => void) {
      resolve({ data: null, error: null });
    },
  };

  const client = {
    from(next: string) {
      table = next;
      return builder;
    },
  };

  return { supabase: client as unknown as SupabaseClient, recorded };
}

function rowFor(recorded: Recorded[], table: string): Record<string, unknown> | undefined {
  return recorded.find((entry) => entry.table === table)?.values;
}

describe('createExpense, from a draft the tile grid filled in', () => {
  it('writes the four columns the one-page form wrote, and no others', async () => {
    const { supabase, recorded } = fakeWriteClient();
    const input = expenseWriteInput(ready());

    await createExpense(supabase, 'farm-1', input!);

    expect(rowFor(recorded, 'expenses')).toEqual({
      farm_id: 'farm-1',
      amount: 380,
      // The expense name lives in the existing `category` column; there is no
      // separate name column and adding one for the same job would be a
      // migration for nothing. See the header of expenses.ts.
      category: 'דלק',
      date: '2026-08-27',
      note: 'תחנת דלק בכניסה',
      source: 'manual',
    });
  });

  // **`source` is createExpense's own defaulted parameter and the sheet has
  // never passed one.** Voice and receipt scanning pass 'voice' and 'ocr'; a
  // hand-typed or hand-tapped expense has to keep saying 'manual', or every
  // record entered from this sheet would start lying about where it came from.
  it('still labels a sheet-entered expense as manual', async () => {
    const { supabase, recorded } = fakeWriteClient();

    await createExpense(supabase, 'farm-1', expenseWriteInput(ready())!);

    expect(rowFor(recorded, 'expenses')?.source).toBe('manual');
  });

  // The plot the sheet inferred from its context, on the allocation row, exactly
  // as before. The farmer was never asked and still is not.
  it('files the inferred plot as a single allocation', async () => {
    const { supabase, recorded } = fakeWriteClient();

    await createExpense(supabase, 'farm-1', expenseWriteInput(ready())!);

    expect(rowFor(recorded, 'expense_allocations')).toEqual({
      farm_id: 'farm-1',
      expense_id: 'expense-1',
      plot_id: 'plot-1',
      amount: 380,
    });
  });

  it('writes no allocation at all for a general farm expense', async () => {
    const { supabase, recorded } = fakeWriteClient();

    await createExpense(supabase, 'farm-1', expenseWriteInput(ready({ plotId: null }))!);

    expect(recorded.map((entry) => entry.table)).toEqual(['expenses']);
  });
});

describe('updateExpense, from a draft the tile grid filled in', () => {
  it('updates the same four columns and never the farm or the source', async () => {
    const { supabase, recorded } = fakeWriteClient();
    const draft = { ...expenseDraftFromExpense(expense()), name: 'דשן', amountText: '412' };

    await updateExpense(supabase, 'farm-1', 'expense-1', expenseWriteInput(draft)!);

    expect(rowFor(recorded, 'expenses')).toEqual({
      amount: 412,
      category: 'דשן',
      date: '2026-08-27',
      note: 'תחנת דלק בכניסה',
    });
  });

  // Soft delete and then insert, in that order. A hard DELETE is refused in
  // silence here -- expense_allocations has no DELETE policy at all -- which is
  // the bug this write was already fixed for once.
  it('replaces the allocation by soft-deleting the old one and inserting a new one', async () => {
    const { supabase, recorded } = fakeWriteClient();

    await updateExpense(supabase, 'farm-1', 'expense-1', expenseWriteInput(ready())!);

    const allocations = recorded.filter((entry) => entry.table === 'expense_allocations');
    expect(allocations.map((entry) => entry.op)).toEqual(['update', 'insert']);
    expect(Object.keys(allocations[0]?.values ?? {})).toEqual(['deleted_at']);
    expect(allocations[1]?.values).toMatchObject({ plot_id: 'plot-1' });
  });
});
