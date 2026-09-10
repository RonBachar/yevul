// ============================================================
// **The one rule this file exists for: an update writes what the caller passed
// and nothing else.**
//
//   undefined   "I do not have this field." The column is not written.
//   null        "Clear this field." The column is written as null.
//
// It is deliberately one file across four modules rather than a few tests added
// to tasks.test.ts, expenses.test.ts and logEntries.test.ts, because it is one
// rule and not four. The bug it locks down has now been found three times in one
// day, in three different columns, by three different accidents:
//
//   sprayQuantity / sprayUnitPrice  the journal sheet has no material UI and
//                                   passed null; a farmer fixing a typo lost how
//                                   his spray's cost was reached.
//   workKind                        the spray walk passed null; the same erasure,
//                                   one field later.
//   estimatedCost / assignedTo      neither Task Sheet renders a cost, and the
//                                   member roster is empty while it loads; a
//                                   spoken cost and an assignment both vanished
//                                   on an unrelated edit.
//
// Every one of them was silent. No error, no toast, nothing on screen -- the
// farmer's data was simply gone the next time he looked. That is why the fix is a
// convention rather than three patches, and why it is pinned here.
//
// **The tests that matter most are the key-set assertions.** They spell out the
// exact set of columns a minimal update writes. Add a field to any of these input
// types, wire it into the payload unconditionally, and one of them fails with a
// diff naming the new column -- which is the point: a future field should break a
// test rather than quietly erase a farmer's data.
//
// The pattern itself is not invented here. updateCropCycle and updateForecast in
// plots.ts have spread fields on `!== undefined` since the crop-editing screens
// were merged, for exactly this reason; this generalises what the codebase had
// already chosen.
// ============================================================

import { describe, expect, it } from 'vitest';
import { updateExpense } from './expenses';
import { createLogEntry, updateLogEntry, type LogEntryUpdate } from './logEntries';
import { createTask, updateTask } from './tasks';

// ============================================================
// A PostgREST stand-in the size of what these writes touch. Chainable, thenable
// (supabase-js hands back a lazy builder, and an unfired query is its own class of
// bug -- see logEntries.test.ts), and it records every operation, because what is
// being asserted here is the shape of the query that was sent and never the value
// that came back.
// ============================================================

type Op = {
  table: string;
  kind: 'select' | 'insert' | 'update';
  payload?: Record<string, unknown>;
  filters: [string, unknown][];
  columns?: string;
};

type Stored = {
  // What a read of `log_entries` hands back: the farm and the money back-link.
  entry?: { farm_id: string; created_expense_id: string | null } | null;
  // What an expense row says its amount is, for the read updateExpense makes when
  // it is asked to move a plot and given no amount to allocate.
  expenseAmount?: number;
};

function fakeSupabase(stored: Stored = {}) {
  const ops: Op[] = [];

  function result(op: Op) {
    if (op.table === 'log_entries' && op.kind === 'select') {
      return { data: stored.entry ?? null, error: null };
    }
    if (op.table === 'expenses' && op.kind === 'select') {
      return { data: { amount: stored.expenseAmount ?? 0 }, error: null };
    }
    if (op.table === 'expenses' && op.kind === 'insert') {
      return { data: [{ id: 'expense-1' }], error: null };
    }
    if (op.table === 'log_entries' && op.kind === 'insert') {
      return { data: [{ id: 'log-1' }], error: null };
    }
    // Every write reports one affected row, which writeOutcome reads as permitted.
    return { data: [{ id: 'row-1', amount: stored.expenseAmount ?? 0 }], error: null };
  }

  const supabase = {
    from(table: string) {
      const op: Op = { table, kind: 'select', filters: [] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        insert(payload: Record<string, unknown>) {
          op.kind = 'insert';
          op.payload = payload;
          ops.push(op);
          return builder;
        },
        update(payload: Record<string, unknown>) {
          op.kind = 'update';
          op.payload = payload;
          ops.push(op);
          return builder;
        },
        upsert(payload: Record<string, unknown>) {
          op.kind = 'insert';
          op.payload = payload;
          ops.push(op);
          return builder;
        },
        select(columns?: string) {
          op.columns = columns;
          // Only a read registers here; an insert().select() is already recorded.
          if (op.kind === 'select') ops.push(op);
          return builder;
        },
        eq(column: string, value: unknown) {
          op.filters.push([column, value]);
          return builder;
        },
        is(column: string, value: unknown) {
          op.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(result(op));
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then(resolve: any, reject: any) {
          return Promise.resolve(result(op)).then(resolve, reject);
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const on = (table: string, kind: Op['kind']) =>
    ops.filter((op) => op.table === table && op.kind === kind);
  const payloadOf = (table: string, kind: Op['kind']) => on(table, kind)[0]?.payload ?? {};
  const keysOf = (table: string, kind: Op['kind']) => Object.keys(payloadOf(table, kind)).sort();

  return { supabase, ops, on, payloadOf, keysOf };
}

// ============================================================
// tasks.ts
// ============================================================

describe('updateTask, the columns it writes', () => {
  // The live bug: both Task Sheets edit a task without ever showing its estimated
  // cost, while voice sets one and both clients display it.
  it('leaves estimated_cost alone when the caller does not pass a cost', async () => {
    const { supabase, keysOf } = fakeSupabase();

    await updateTask(supabase, 'task-1', 'farm-1', { title: 'לרסס' });

    expect(keysOf('tasks', 'update')).not.toContain('estimated_cost');
  });

  it('clears estimated_cost when the caller passes an explicit null', async () => {
    const { supabase, payloadOf } = fakeSupabase();

    await updateTask(supabase, 'task-1', 'farm-1', { title: 'לרסס', estimatedCost: null });

    expect(payloadOf('tasks', 'update')).toMatchObject({ estimated_cost: null });
  });

  // The second live bug, and the subtler one: assignableMembers returns [] while
  // useMembers is still loading, so a sheet that decided from its length wrote
  // "nobody" over a real assignment. Both sheets now omit the field instead.
  it('leaves assigned_to alone when the roster has not arrived', async () => {
    const { supabase, keysOf } = fakeSupabase();

    await updateTask(supabase, 'task-1', 'farm-1', { title: 'לרסס' });

    expect(keysOf('tasks', 'update')).not.toContain('assigned_to');
  });

  it('unassigns on an explicit null, because that is a real thing to want', async () => {
    const { supabase, payloadOf } = fakeSupabase();

    await updateTask(supabase, 'task-1', 'farm-1', { title: 'לרסס', assignedTo: null });

    expect(payloadOf('tasks', 'update')).toMatchObject({ assigned_to: null });
  });

  // **The lock.** A field added to TaskInput and wired in unconditionally shows up
  // here as an extra key.
  it('writes the title and nothing else on a title-only edit', async () => {
    const { supabase, keysOf } = fakeSupabase();

    await updateTask(supabase, 'task-1', 'farm-1', { title: '  לגזום  ' });

    expect(keysOf('tasks', 'update')).toEqual(['title']);
  });

  it('trims the title it does write', async () => {
    const { supabase, payloadOf } = fakeSupabase();

    await updateTask(supabase, 'task-1', 'farm-1', { title: '  לגזום  ' });

    expect(payloadOf('tasks', 'update')).toEqual({ title: 'לגזום' });
  });

  it('still writes every column a caller that has them all passes', async () => {
    const { supabase, keysOf } = fakeSupabase();

    await updateTask(supabase, 'task-1', 'farm-1', {
      title: 'לגזום',
      plotId: 'plot-1',
      dueDate: '2026-09-20',
      estimatedCost: 200,
      assignedTo: 'user-1',
    });

    expect(keysOf('tasks', 'update')).toEqual([
      'assigned_to',
      'due_date',
      'estimated_cost',
      'plot_id',
      'title',
    ]);
  });

  // An absent column on an INSERT takes the table default, which is null for all
  // four, so the same partial input is safe on a create. What must never go
  // missing is the farm.
  it('carries the farm onto a create built from the same partial input', async () => {
    const { supabase, payloadOf } = fakeSupabase();

    await createTask(supabase, 'farm-1', { title: 'לגזום' });

    expect(payloadOf('tasks', 'insert')).toEqual({ farm_id: 'farm-1', title: 'לגזום' });
  });
});

// ============================================================
// expenses.ts
// ============================================================

describe('updateExpense, the columns it writes', () => {
  it('writes only the amount when only the amount was passed', async () => {
    const { supabase, keysOf } = fakeSupabase({ expenseAmount: 500 });

    await updateExpense(supabase, 'farm-1', 'expense-1', { amount: 120 });

    expect(keysOf('expenses', 'update')).toEqual(['amount']);
  });

  it('clears the name and the note on explicit nulls', async () => {
    const { supabase, payloadOf } = fakeSupabase();

    await updateExpense(supabase, 'farm-1', 'expense-1', { name: null, note: null });

    expect(payloadOf('expenses', 'update')).toEqual({ category: null, note: null });
  });

  // `category` is the column an expense's *name* lives in -- there is no separate
  // name column, see the header of expenses.ts -- and a box the farmer emptied is
  // stored as "no name" rather than as an empty string.
  it('collapses a blank name to null and trims a real one', async () => {
    const blank = fakeSupabase();
    const typed = fakeSupabase();

    await updateExpense(blank.supabase, 'farm-1', 'expense-1', { name: '   ' });
    await updateExpense(typed.supabase, 'farm-1', 'expense-1', { name: '  דלק  ' });

    expect(blank.payloadOf('expenses', 'update')).toEqual({ category: null });
    expect(typed.payloadOf('expenses', 'update')).toEqual({ category: 'דלק' });
  });

  it('still writes every column a caller that has them all passes', async () => {
    const { supabase, keysOf } = fakeSupabase();

    await updateExpense(supabase, 'farm-1', 'expense-1', {
      amount: 120,
      name: 'דלק',
      plotId: 'plot-1',
      date: '2026-09-10',
      note: 'טרקטור',
    });

    expect(keysOf('expenses', 'update')).toEqual(['amount', 'category', 'date', 'note']);
  });
});

// **The plot is not a column on the expense**, it is a row in
// expense_allocations, so "the caller did not pass a plot" and "the caller cleared
// the plot" have to be two different sets of writes rather than two values.
describe('updateExpense, the allocation', () => {
  it('does not touch the allocations at all when no plot was passed', async () => {
    const { supabase, ops } = fakeSupabase({ expenseAmount: 500 });

    await updateExpense(supabase, 'farm-1', 'expense-1', { amount: 120 });

    expect(ops.map((op) => op.table)).not.toContain('expense_allocations');
  });

  // This is case 4 of the report, from the other side: a journal edit that fed a
  // null plot through here cleared the allocation and wrote none, and the money
  // silently left the plot's totals.
  it('clears the allocations and writes none when the plot is an explicit null', async () => {
    const { supabase, on } = fakeSupabase();

    await updateExpense(supabase, 'farm-1', 'expense-1', { amount: 120, plotId: null });

    expect(on('expense_allocations', 'update')).toHaveLength(1);
    expect(on('expense_allocations', 'insert')).toHaveLength(0);
  });

  it('soft-clears rather than deletes, because the table has no DELETE policy', async () => {
    const { supabase, on } = fakeSupabase();

    await updateExpense(supabase, 'farm-1', 'expense-1', { amount: 120, plotId: null });

    expect(Object.keys(on('expense_allocations', 'update')[0]?.payload ?? {})).toEqual([
      'deleted_at',
    ]);
  });

  it('rewrites the allocation against the plot it was given', async () => {
    const { supabase, on } = fakeSupabase();

    await updateExpense(supabase, 'farm-1', 'expense-1', { amount: 120, plotId: 'plot-2' });

    expect(on('expense_allocations', 'insert')[0]?.payload).toEqual({
      farm_id: 'farm-1',
      expense_id: 'expense-1',
      plot_id: 'plot-2',
      amount: 120,
    });
  });

  // A plot move on its own writes no expense columns, so there is no returned row
  // to read an amount off -- and expense_allocations has a XOR check constraint
  // over (percent, amount), so an insert with no amount is impossible. Clearing the
  // allocations and then failing to write the new one is how money leaves a plot.
  it('reads the stored amount when it is asked to move a plot and given no amount', async () => {
    const { supabase, on } = fakeSupabase({ expenseAmount: 640 });

    await updateExpense(supabase, 'farm-1', 'expense-1', { plotId: 'plot-2' });

    expect(on('expenses', 'update')).toHaveLength(0);
    expect(on('expense_allocations', 'insert')[0]?.payload).toMatchObject({ amount: 640 });
  });

  // An empty payload is a 400 at PostgREST, not a no-op, and the farmer would be
  // told his edit failed when there was nothing to fail.
  it('sends no expense update when there is nothing to write', async () => {
    const { supabase, on } = fakeSupabase({ expenseAmount: 640 });

    const result = await updateExpense(supabase, 'farm-1', 'expense-1', {});

    expect(on('expenses', 'update')).toHaveLength(0);
    expect(result).toEqual({ ok: true, id: 'expense-1' });
  });
});

// ============================================================
// logEntries.ts -- the delicate one, because writePayload is shared by the create
// (which legitimately writes the whole row) and the update (which must not).
// ============================================================

function entryUpdate(overrides: Partial<LogEntryUpdate> = {}): LogEntryUpdate {
  return { date: '2026-09-10', type: 'other', ...overrides };
}

const FULL_ENTRY = {
  plotId: 'plot-1',
  date: '2026-09-10',
  type: 'spray' as const,
  note: 'note',
  sprayPest: 'כנימה',
  sprayMaterial: 'קונפידור',
  sprayDose: '50',
  sprayPhiDays: 3,
  sprayQuantity: 5,
  sprayQuantityUnit: 'liter' as const,
  sprayUnitPrice: 20,
  workHours: 3,
  workHourlyRate: 60,
  workKind: 'גיזום',
  cost: null,
  harvestQty: null,
  harvestUnit: null,
};

describe('updateLogEntry, the columns it writes', () => {
  it('writes the date and the type and nothing else on a minimal edit', async () => {
    const { supabase, keysOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(supabase, 'log-1', entryUpdate());

    // Every spray and harvest column is still here, as a null, because the type is
    // 'other' and the gates are shut. That is the next describe block's subject.
    expect(keysOf('log_entries', 'update')).toEqual([
      'date',
      'harvest_qty',
      'harvest_unit',
      'spray_dose',
      'spray_material',
      'spray_pest',
      'spray_phi_days',
      'spray_quantity',
      'spray_quantity_unit',
      'spray_unit_price',
      'type',
    ]);
  });

  // The bug found on 2026-09-10, pinned. The journal sheet has no material UI, so
  // it used to pass nulls and erase how a spray's cost was reached.
  it('leaves a spray quantity, unit and price alone when they are not passed', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(
      supabase,
      'log-1',
      entryUpdate({ type: 'spray', sprayPest: 'כנימה', sprayMaterial: 'קונפידור', note: 'תוקן' }),
    );

    const payload = payloadOf('log_entries', 'update');
    expect(payload).not.toHaveProperty('spray_quantity');
    expect(payload).not.toHaveProperty('spray_quantity_unit');
    expect(payload).not.toHaveProperty('spray_unit_price');
  });

  // The same bug, one field later, and ungated: work_kind belongs to the work and
  // not to the type, so nothing else would have protected it.
  it('leaves the kind of work and the hours alone when they are not passed', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(supabase, 'log-1', entryUpdate({ note: 'תוקן' }));

    const payload = payloadOf('log_entries', 'update');
    expect(payload).not.toHaveProperty('work_kind');
    expect(payload).not.toHaveProperty('work_hours');
    expect(payload).not.toHaveProperty('work_hourly_rate');
  });

  it('clears them on explicit nulls, because emptying a box is a real edit', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(
      supabase,
      'log-1',
      entryUpdate({ workKind: null, workHours: null, workHourlyRate: null }),
    );

    expect(payloadOf('log_entries', 'update')).toMatchObject({
      work_kind: null,
      work_hours: null,
      work_hourly_rate: null,
    });
  });

  it('collapses a blank kind of work to null so the suggestion grid cannot fill with whitespace', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(supabase, 'log-1', entryUpdate({ workKind: '   ' }));

    expect(payloadOf('log_entries', 'update')).toMatchObject({ work_kind: null });
  });
});

// **The gates are the part that must survive the change.** They are decided from
// `type`, which every write states, and never from whether the caller passed the
// field -- so a record retyped away from spray still loses its spray columns even
// on a caller that renders none of them.
describe('updateLogEntry, the type gates', () => {
  it('clears every spray column when the type moved away from spray', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(supabase, 'log-1', entryUpdate({ type: 'fertilize' }));

    expect(payloadOf('log_entries', 'update')).toMatchObject({
      spray_pest: null,
      spray_material: null,
      spray_dose: null,
      spray_phi_days: null,
      spray_quantity: null,
      spray_quantity_unit: null,
      spray_unit_price: null,
    });
  });

  it('clears them even when the caller hands the old spray values straight back', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(
      supabase,
      'log-1',
      entryUpdate({ type: 'prune', sprayMaterial: 'קונפידור', sprayQuantity: 5 }),
    );

    expect(payloadOf('log_entries', 'update')).toMatchObject({
      spray_material: null,
      spray_quantity: null,
    });
  });

  it('clears the harvest columns when the type moved away from harvest', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(supabase, 'log-1', entryUpdate({ type: 'till', harvestQty: 900 }));

    expect(payloadOf('log_entries', 'update')).toMatchObject({
      harvest_qty: null,
      harvest_unit: null,
    });
  });

  it('keeps the hours and the kind of work through a type change, because they are not gated', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(
      supabase,
      'log-1',
      entryUpdate({ type: 'other', workHours: 3, workKind: 'גיזום' }),
    );

    expect(payloadOf('log_entries', 'update')).toMatchObject({
      work_hours: 3,
      work_kind: 'גיזום',
    });
  });
});

// A create has nothing to preserve: the row does not exist, so a column nobody
// filled in has to end up empty. That is the other half of the shared builder.
describe('createLogEntry, which still writes the whole row', () => {
  it('writes every column, so a new entry has no column left undefined', async () => {
    const { supabase, keysOf } = fakeSupabase();

    await createLogEntry(supabase, 'farm-1', FULL_ENTRY);

    expect(keysOf('log_entries', 'insert')).toEqual([
      'date',
      'farm_id',
      'harvest_qty',
      'harvest_unit',
      'note',
      'plot_id',
      'source',
      'spray_dose',
      'spray_material',
      'spray_pest',
      'spray_phi_days',
      'spray_quantity',
      'spray_quantity_unit',
      'spray_unit_price',
      'type',
      'work_hourly_rate',
      'work_hours',
      'work_kind',
    ]);
  });
});

// ============================================================
// The money side of a journal edit. Founder's decision, 2026-09-10: once the
// farmer has edited the expense on the money screen, his edit is the truth.
// ============================================================

describe('a journal edit and the expense it already made', () => {
  const LINKED = { entry: { farm_id: 'farm-1', created_expense_id: 'expense-1' } };

  // The bug: syncEntryExpense fed updateExpense a complete input rebuilt from the
  // entry -- name recomputed, note copied, plot taken from the entry -- so a
  // farmer who renamed that expense on the money screen lost the rename the next
  // time he touched the journal entry, even for a one-character typo.
  it('writes the amount and nothing else', async () => {
    const { supabase, keysOf } = fakeSupabase(LINKED);

    await updateLogEntry(supabase, 'log-1', entryUpdate({ cost: 300, note: 'תוקן' }));

    expect(keysOf('expenses', 'update')).toEqual(['amount']);
  });

  it('does not rename the expense back to the material or the type label', async () => {
    const { supabase, payloadOf } = fakeSupabase(LINKED);

    await updateLogEntry(
      supabase,
      'log-1',
      entryUpdate({ type: 'spray', sprayPest: 'כנימה', sprayMaterial: 'קונפידור', cost: 300 }),
    );

    expect(payloadOf('expenses', 'update')).toEqual({ amount: 300 });
  });

  // Case 4: on a farm-level entry the null plot used to reach clearAllocations,
  // and writeAllocation then returned early, so the expense fell off the plot's
  // totals without a word.
  it('does not touch the allocation, so the money stays on the plot it is booked to', async () => {
    const { supabase, ops } = fakeSupabase(LINKED);

    await updateLogEntry(supabase, 'log-1', entryUpdate({ plotId: null, cost: 300 }));

    expect(ops.map((op) => op.table)).not.toContain('expense_allocations');
  });

  it('leaves the expense entirely alone when the caller says nothing about cost', async () => {
    const { supabase, on } = fakeSupabase(LINKED);

    await updateLogEntry(supabase, 'log-1', entryUpdate({ note: 'תוקן' }));

    expect(on('expenses', 'update')).toHaveLength(0);
    expect(on('expenses', 'insert')).toHaveLength(0);
  });

  // An explicit null is still the farmer saying "this did not cost me that", and
  // it still soft-deletes the expense. deleteExpense stamps `deleted_at` and
  // clears the journal's back-link.
  it('deletes the expense when the cost is explicitly cleared', async () => {
    const { supabase, on } = fakeSupabase(LINKED);

    await updateLogEntry(supabase, 'log-1', entryUpdate({ cost: null }));

    const expenseWrite = on('expenses', 'update')[0]?.payload ?? {};
    expect(Object.keys(expenseWrite)).toEqual(['deleted_at']);
  });

  // Nothing of the farmer's exists yet on a brand-new expense, and the entry is
  // all the information there is, so this one is still built whole.
  it('still builds a brand-new expense out of the whole entry', async () => {
    const { supabase, payloadOf } = fakeSupabase({
      entry: { farm_id: 'farm-1', created_expense_id: null },
    });

    await updateLogEntry(
      supabase,
      'log-1',
      entryUpdate({
        type: 'spray',
        sprayPest: 'כנימה',
        sprayMaterial: 'קונפידור',
        plotId: 'plot-1',
        note: 'הערה',
        cost: 300,
      }),
    );

    expect(payloadOf('expenses', 'insert')).toMatchObject({
      farm_id: 'farm-1',
      amount: 300,
      category: 'קונפידור',
      date: '2026-09-10',
      note: 'הערה',
    });
  });
});
