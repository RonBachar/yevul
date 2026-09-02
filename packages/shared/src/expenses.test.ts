// Tests for deleting an expense, packages/shared/src/expenses.ts.
//
// **What is being pinned is a decision, not an arithmetic.** An expense hangs
// three things off itself — `expense_allocations` rows, a `receipts` row, and an
// object in the private bucket — and deleteExpense deliberately touches none of
// them. Both halves of that need locking, and only one of them is visible in the
// function body:
//
//   1. **Leaving the allocation is safe.** The money is never on it. Its
//      `amount` column is written by writeAllocation and read by nobody;
//      EXPENSE_COLUMNS embeds only `plot_id`, so every figure the product shows
//      (profit.ts, reports.ts) is summed from `expenses.amount`. And the only
//      reads of that table are child joins under a query on `expenses` that
//      already filters `deleted_at is null`, so a leftover allocation is
//      unreachable rather than merely harmless. Clearing it is the move that
//      *could* corrupt the record: that is updateExpense's clearAllocations, and
//      an expense restored afterwards would come back as a general farm expense
//      instead of the plot's.
//
//   2. **Leaving the bytes is the whole point.** `receipts_storage_delete`
//      exists in the policy, so this client could erase an accountant's
//      document, and nothing in this product ever hard-deletes anything. The
//      test below makes the storage client throw, so a future edit that reaches
//      for it fails here rather than in a farm's bucket.
//
// What stays untested is everything locked inside a component: neither client
// has a test runner, so the confirmation dialog, the button, and the reload
// after the write are verified by reading, not by running.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteExpense } from './expenses';
import { deleteTask } from './tasks';

type WriteResult = { data: { id: string }[] | null; error: { message: string } | null };

type Recorded = {
  tables: string[];
  updates: Record<string, unknown>[];
  filters: string[];
  selected: string | null;
};

// A supabase client the size of what deleteExpense actually touches, and no
// larger. It records the write, because every property worth asserting here is
// about the query that was sent and not about the value that came back.
function fakeSupabase(result: WriteResult) {
  const recorded: Recorded = { tables: [], updates: [], filters: [], selected: null };

  const builder = {
    update(values: Record<string, unknown>) {
      recorded.updates.push(values);
      return builder;
    },
    eq(column: string, value: string) {
      recorded.filters.push(`${column} = ${value}`);
      return builder;
    },
    // The last link in the chain, so this is where the write resolves.
    select(columns: string) {
      recorded.selected = columns;
      return Promise.resolve(result);
    },
    // Present so that a hard delete would run rather than fail on a missing
    // method, and be caught by the assertion instead of by a type error.
    delete() {
      recorded.updates.push({ hardDelete: true });
      return builder;
    },
  };

  const client = {
    from(table: string) {
      recorded.tables.push(table);
      return builder;
    },
    // Reaching for the bucket is the one irreversible thing available on this
    // path, so it is booby trapped rather than stubbed.
    get storage() {
      throw new Error('deleteExpense reached the receipts storage bucket');
    },
  };

  return { supabase: client as unknown as SupabaseClient, recorded };
}

const ONE_ROW: WriteResult = { data: [{ id: 'expense-1' }], error: null };

describe('deleteExpense, the write', () => {
  it('stamps deleted_at instead of removing the row', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);

    await deleteExpense(supabase, 'expense-1');

    expect(recorded.updates).toHaveLength(1);
    expect(Object.keys(recorded.updates[0] ?? {})).toEqual(['deleted_at']);
    expect(recorded.updates[0]?.hardDelete).toBeUndefined();
  });

  // The column is timestamptz, and the schema grants no DELETE on any table:
  // "מחיקה היא תמיד UPDATE על deleted_at" (core_schema.sql).
  it('writes an ISO-8601 instant', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);

    await deleteExpense(supabase, 'expense-1');

    expect(String(recorded.updates[0]?.deleted_at)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('scopes the write to the one expense', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);

    await deleteExpense(supabase, 'expense-1');

    expect(recorded.filters).toEqual(['id = expense-1']);
  });

  // **Without the select there is no outcome at all.** PostgREST answers an
  // UPDATE that RLS refused with success and zero rows, never an error, so the
  // returned rows are the only signal that anything happened. See postgrest.ts.
  // Unlike `tasks`, `expenses` already carries a table-level SELECT grant
  // (core_schema.sql), so this needs no migration of its own.
  it('asks for the row back, because that is the only way to tell refusal from success', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);

    await deleteExpense(supabase, 'expense-1');

    expect(recorded.selected).toBe('id');
  });

  // The pattern this feature was told to match rather than reinvent. If either
  // function grows a second write, or stops soft-deleting, they stop agreeing.
  it('writes the same soft delete deleteTask writes', async () => {
    const expense = fakeSupabase(ONE_ROW);
    const task = fakeSupabase({ data: [{ id: 'task-1' }], error: null });

    await deleteExpense(expense.supabase, 'row-1');
    await deleteTask(task.supabase, 'row-1');

    expect(Object.keys(expense.recorded.updates[0] ?? {})).toEqual(
      Object.keys(task.recorded.updates[0] ?? {}),
    );
    expect(expense.recorded.filters).toEqual(task.recorded.filters);
    expect(expense.recorded.selected).toBe(task.recorded.selected);
  });
});

describe('deleteExpense, what it leaves alone', () => {
  // The allocation and the receipt row both survive, and both are already
  // invisible: every read of either is a child of a query on `expenses` that
  // filters `deleted_at is null`, so they leave the lists, the plot totals and
  // the CSV exports with the expense they belong to.
  it('touches the expenses table and nothing else', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);

    await deleteExpense(supabase, 'expense-1');

    expect(recorded.tables).toEqual(['expenses']);
    expect(recorded.tables).not.toContain('expense_allocations');
    expect(recorded.tables).not.toContain('receipts');
  });

  // Deleting bytes cannot be undone and nothing else in this product does it.
  // The stub throws, so this call would reject if the function ever tried.
  it('never reaches the storage bucket', async () => {
    const { supabase } = fakeSupabase(ONE_ROW);

    await expect(deleteExpense(supabase, 'expense-1')).resolves.toEqual({ ok: true });
  });
});

describe('deleteExpense, the outcome', () => {
  it('succeeds when a row comes back', async () => {
    const { supabase } = fakeSupabase(ONE_ROW);

    expect(await deleteExpense(supabase, 'expense-1')).toEqual({ ok: true });
  });

  // A worker is blocked from the money tables at row level, so the USING clause
  // matches nothing and the update quietly affects nobody.
  it('reads zero rows as forbidden and not as done', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await deleteExpense(supabase, 'expense-1')).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('reads a null payload as forbidden as well', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await deleteExpense(supabase, 'expense-1')).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('reports a real failure as an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'connection reset' } });

    expect(await deleteExpense(supabase, 'expense-1')).toEqual({ ok: false, reason: 'error' });
  });
});
