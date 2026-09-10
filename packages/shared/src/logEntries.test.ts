import { describe, expect, it } from 'vitest';
import {
  createLogEntry,
  deleteLogEntry,
  initialLogEntryType,
  LOG_ENTRY_TYPES,
  logEntryTypeLabelKey,
  saveSprayPrice,
  updateLogEntry,
  type LogEntry,
  type LogEntryInput,
} from './logEntries';

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    farmId: 'farm-1',
    plotId: 'plot-1',
    date: '2026-08-25',
    type: 'harvest',
    note: null,
    source: 'manual',
    sprayPest: null,
    sprayMaterial: null,
    sprayDose: null,
    sprayPhiDays: null,
    sprayQuantity: null,
    sprayQuantityUnit: null,
    sprayUnitPrice: null,
    workHours: null,
    workHourlyRate: null,
    createdExpenseId: null,
    cost: null,
    harvestQty: null,
    harvestUnit: null,
    createdAt: '2026-08-25T06:00:00.000Z',
    ...overrides,
  };
}

function input(overrides: Partial<LogEntryInput> = {}): LogEntryInput {
  return {
    plotId: 'plot-1',
    date: '2026-08-25',
    type: 'other',
    note: null,
    sprayPest: null,
    sprayMaterial: null,
    sprayDose: null,
    sprayPhiDays: null,
    sprayQuantity: null,
    sprayQuantityUnit: null,
    sprayUnitPrice: null,
    workHours: null,
    workHourlyRate: null,
    cost: null,
    harvestQty: null,
    harvestUnit: null,
    ...overrides,
  };
}

// ============================================================
// A PostgREST stand-in the size of what these writes actually touch: a chainable
// builder that records every operation and is itself thenable, because that is
// what supabase-js hands back and half the bugs this file has caught were an
// unfired lazy query.
//
// It answers the four reads and writes the money path makes and nothing else: an
// insert hands back one id, a select of the entry hands back whatever the test
// said is already stored, and every update reports one affected row (which
// writeOutcome reads as a permitted write).
// ============================================================

type Op = {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'upsert';
  payload?: Record<string, unknown>;
  filters: [string, unknown][];
};

type StoredEntry = { farm_id: string; created_expense_id: string | null } | null;

function fakeSupabase(stored: StoredEntry = null) {
  const ops: Op[] = [];

  function result(op: Op) {
    if (op.kind === 'select') return { data: stored, error: null };
    if (op.kind === 'insert' && op.table === 'expenses') {
      return { data: [{ id: 'expense-1' }], error: null };
    }
    if (op.kind === 'insert' && op.table === 'log_entries') {
      return { data: [{ id: 'log-1' }], error: null };
    }
    return { data: [{ id: 'row-1' }], error: null };
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
          op.kind = 'upsert';
          op.payload = payload;
          ops.push(op);
          return builder;
        },
        select() {
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

  return { supabase, ops, on };
}

// כל אחד מעשרת הסוגים חייב מפתח תרגום ייחודי, אחרת שני צ'יפים בגיליון
// היו מציגים את אותה מחרוזת בטעות (t מחזיר את המפתח עצמו כשאין תרגום,
// אז מפתח כפול היה נראה תקין בבדיקה שטחית אבל שבור בפועל בעברית).
describe('logEntryTypeLabelKey', () => {
  it('gives every type in the fixed prd.md order a distinct key', () => {
    const keys = LOG_ENTRY_TYPES.map(logEntryTypeLabelKey);
    expect(new Set(keys).size).toBe(LOG_ENTRY_TYPES.length);
  });

  it('lists spray and harvest in the order prd.md and design.md specify', () => {
    expect(LOG_ENTRY_TYPES).toEqual([
      'till',
      'sow',
      'fertilize',
      'spray',
      'irrigate',
      'prune',
      'thin',
      'harvest',
      'repair',
      'other',
    ]);
  });
});

// The Spray Log Screen opens the sheet asking for 'spray', so the screen that
// exists for spray records can create one. The rule that matters is the second
// test: an entry already saved keeps its own type, whatever the screen asks
// for.
describe('initialLogEntryType', () => {
  it('starts a new entry on the type the screen asked for', () => {
    expect(initialLogEntryType(null, 'spray')).toBe('spray');
  });

  it('lets an existing entry keep its own type over the default', () => {
    expect(initialLogEntryType(entry({ type: 'harvest' }), 'spray')).toBe('harvest');
  });

  it('falls back to other when no screen asked for anything', () => {
    expect(initialLogEntryType(null)).toBe('other');
    expect(initialLogEntryType(null, undefined)).toBe('other');
  });
});

// מזיק וחומר חובה רק כשהסוג ריסוס, prd.md סעיף 8. הבדיקה הזו רצה בלי
// לגעת ברשת בכלל, כי הוולידציה חוסמת לפני שהיא בכלל בונה שאילתה.
describe('createLogEntry, spray validation', () => {
  const unreachableSupabase = {
    from() {
      throw new Error('should not query the database when validation already failed');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it('rejects a spray entry with no pest', async () => {
    const result = await createLogEntry(
      unreachableSupabase,
      'farm-1',
      input({
        type: 'spray',
        sprayMaterial: 'קונפידור',
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'pestRequired' });
  });

  it('rejects a spray entry with no material', async () => {
    const result = await createLogEntry(
      unreachableSupabase,
      'farm-1',
      input({
        type: 'spray',
        sprayPest: 'כנימה',
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'materialRequired' });
  });

  it('does not require pest or material for a non-spray type', async () => {
    const supabase = {
      from() {
        return {
          insert() {
            return { select: () => Promise.resolve({ data: [{ id: 'log-1' }], error: null }) };
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const result = await createLogEntry(
      supabase,
      'farm-1',
      input({ type: 'harvest', harvestQty: 10 }),
    );
    expect(result).toEqual({ ok: true });
  });
});

// The four fields are what make a spray record a regulatory document, and the
// last two are what safeHarvestDate is computed from. Every screen that opens
// the sheet ends here, so this asserts the write itself, once, instead of once
// per entry point.
describe('createLogEntry, spray fields', () => {
  it('writes pest, material, dose and PHI days on a spray entry', async () => {
    const inserts: Record<string, unknown>[] = [];
    const supabase = {
      from() {
        return {
          insert(row: Record<string, unknown>) {
            inserts.push(row);
            return { select: () => Promise.resolve({ data: [{ id: 'log-1' }], error: null }) };
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await createLogEntry(
      supabase,
      'farm-1',
      input({
        type: 'spray',
        sprayPest: 'כנימה',
        sprayMaterial: 'קונפידור',
        sprayDose: '200 סמ"ק',
        sprayPhiDays: 14,
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      farm_id: 'farm-1',
      type: 'spray',
      spray_pest: 'כנימה',
      spray_material: 'קונפידור',
      spray_dose: '200 סמ"ק',
      spray_phi_days: 14,
    });
  });
});

// The pricelist screen's write. Ido asked for a pricelist he fills in once
// ("give me a pricelist where I enter the prices once"), and the one rule that
// governs it is that the number is always his: the app validates that a number
// is there and never supplies one.
describe('saveSprayPrice', () => {
  const unreachableSupabase = {
    from() {
      throw new Error('should not query the database when validation already failed');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  function upsertSpy() {
    const upserts: { row: Record<string, unknown>; options: unknown }[] = [];
    const supabase = {
      from() {
        return {
          upsert(row: Record<string, unknown>, options: unknown) {
            upserts.push({ row, options });
            return {
              select: () => Promise.resolve({ data: [{ id: 'price-1' }], error: null }),
            };
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return { supabase, upserts };
  }

  it('refuses a row with no material and one with no price', async () => {
    expect(
      await saveSprayPrice(unreachableSupabase, 'farm-1', {
        material: '  ',
        unitPrice: 40,
        unit: 'kg',
      }),
    ).toEqual({ ok: false, reason: 'materialRequired' });

    expect(
      await saveSprayPrice(unreachableSupabase, 'farm-1', {
        material: 'קונפידור',
        unitPrice: null,
        unit: 'kg',
      }),
    ).toEqual({ ok: false, reason: 'priceRequired' });

    expect(
      await saveSprayPrice(unreachableSupabase, 'farm-1', {
        material: 'קונפידור',
        unitPrice: -1,
        unit: 'kg',
      }),
    ).toEqual({ ok: false, reason: 'priceRequired' });
  });

  // Zero is a real price: a material left over from last season cost nothing
  // this year, and refusing it would force an invented number into the table.
  it('accepts a price of zero', async () => {
    const { supabase, upserts } = upsertSpy();
    const result = await saveSprayPrice(supabase, 'farm-1', {
      material: 'גופרית',
      unitPrice: 0,
      unit: 'kg',
    });
    expect(result).toEqual({ ok: true });
    expect(upserts[0]?.row).toMatchObject({ unit_price: 0 });
  });

  // The same normalized key rememberSprayMaterialPrice writes, so a price
  // stated on the pricelist screen and one remembered from a spray are one row.
  it('writes the normalized material name on the farm row', async () => {
    const { supabase, upserts } = upsertSpy();
    const result = await saveSprayPrice(supabase, 'farm-1', {
      material: '  קונפידור  ',
      unitPrice: 40,
      unit: 'kg',
    });

    expect(result).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.row).toMatchObject({
      farm_id: 'farm-1',
      material_normalized: 'קונפידור',
      unit_price: 40,
      unit: 'kg',
    });
    expect(upserts[0]?.options).toEqual({ onConflict: 'farm_id,material_normalized' });
  });

  // A worker is blocked from this table at row level. PostgREST answering with
  // no rows is what "forbidden" means here, exactly as everywhere else.
  it('reports a blocked write as forbidden rather than as a save', async () => {
    const supabase = {
      from() {
        return {
          upsert() {
            return { select: () => Promise.resolve({ data: [], error: null }) };
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await saveSprayPrice(supabase, 'farm-1', {
      material: 'קונפידור',
      unitPrice: 40,
      unit: 'kg',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

// ============================================================
// Money lives in `expenses` only. Founder's decision 2026-09-10, and this is the
// suite that holds it: the journal must have no way to state a cost of its own,
// and every cost it does carry must end up as exactly one expense row.
//
// The point of the change is that double counting becomes inexpressible, so the
// first test is the one that would have caught the old behaviour -- no cost
// column reaches the insert at all.
// ============================================================

describe('createLogEntry, the money it writes', () => {
  it('puts no cost column on the journal row', async () => {
    const { supabase, on } = fakeSupabase();
    await createLogEntry(
      supabase,
      'farm-1',
      input({ type: 'repair', workHours: 3, workHourlyRate: 60, cost: 180 }),
    );

    const row = on('log_entries', 'insert')[0]?.payload ?? {};
    expect(row).not.toHaveProperty('spray_cost');
    expect(row).not.toHaveProperty('work_cost');
    expect(row).not.toHaveProperty('cost');
    // The breakdown itself stays: it is the record of how the number was reached.
    expect(row).toMatchObject({ work_hours: 3, work_hourly_rate: 60 });
  });

  it('writes one expense for the entry and links it back', async () => {
    const { supabase, on } = fakeSupabase();
    const result = await createLogEntry(
      supabase,
      'farm-1',
      input({ type: 'repair', plotId: 'plot-1', cost: 180 }),
    );

    expect(result).toEqual({ ok: true });
    const expenses = on('expenses', 'insert');
    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.payload).toMatchObject({ farm_id: 'farm-1', amount: 180 });
    expect(on('log_entries', 'update')[0]?.payload).toEqual({ created_expense_id: 'expense-1' });
  });

  // One entry, one expense, even carrying both halves. The founder's words: Ido
  // wants to know what the spray cost him, and that is one number.
  it('writes a single expense when the entry carries both material and hours', async () => {
    const { supabase, on } = fakeSupabase();
    await createLogEntry(
      supabase,
      'farm-1',
      input({
        type: 'spray',
        sprayPest: 'כנימה',
        sprayMaterial: 'קונפידור',
        sprayQuantity: 3,
        sprayQuantityUnit: 'kg',
        sprayUnitPrice: 40,
        workHours: 3,
        workHourlyRate: 60,
        cost: 300,
      }),
    );

    const expenses = on('expenses', 'insert');
    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.payload).toMatchObject({ amount: 300 });
  });

  // The plot allocation comes from the entry, and a null plot is a farm-level
  // expense with no allocation at all -- how a general expense has always worked.
  it('allocates the expense to the entry plot, and to none when there is no plot', async () => {
    const withPlot = fakeSupabase();
    await createLogEntry(withPlot.supabase, 'farm-1', input({ plotId: 'plot-7', cost: 50 }));
    expect(withPlot.on('expense_allocations', 'insert')[0]?.payload).toMatchObject({
      plot_id: 'plot-7',
      amount: 50,
    });

    const withoutPlot = fakeSupabase();
    await createLogEntry(withoutPlot.supabase, 'farm-1', input({ plotId: null, cost: 50 }));
    expect(withoutPlot.on('expense_allocations', 'insert')).toHaveLength(0);
  });

  it('writes no expense at all when the entry carries no cost', async () => {
    const { supabase, on } = fakeSupabase();
    await createLogEntry(supabase, 'farm-1', input({ cost: null }));
    expect(on('expenses', 'insert')).toHaveLength(0);
    expect(on('log_entries', 'update')).toHaveLength(0);
  });

  // The expense name is what the farmer reads on the money screen. It is stored
  // in `expenses.category`, which is the name column -- see expenses.ts.
  it('names the expense after the material, or after the entry type', async () => {
    const spray = fakeSupabase();
    await createLogEntry(
      spray.supabase,
      'farm-1',
      input({ type: 'spray', sprayPest: 'כנימה', sprayMaterial: 'קונפידור', cost: 120 }),
    );
    expect(spray.on('expenses', 'insert')[0]?.payload).toMatchObject({ category: 'קונפידור' });

    const repair = fakeSupabase();
    await createLogEntry(repair.supabase, 'farm-1', input({ type: 'repair', cost: 120 }));
    // The existing Hebrew label for the type, not a new string invented here.
    expect(repair.on('expenses', 'insert')[0]?.payload).toMatchObject({ category: 'תיקון' });
  });

  // Manual entry always wins, the standing rule of this product: no material, no
  // quantity, no hours, no rate, just a number.
  it('accepts a bare typed cost with no breakdown behind it', async () => {
    const { supabase, on } = fakeSupabase();
    await createLogEntry(supabase, 'farm-1', input({ type: 'other', cost: 250 }));
    expect(on('expenses', 'insert')[0]?.payload).toMatchObject({ amount: 250 });
  });
});

describe('updateLogEntry, the money it moves', () => {
  it('updates the expense it already made instead of writing a second', async () => {
    const { supabase, on } = fakeSupabase({ farm_id: 'farm-1', created_expense_id: 'expense-9' });
    await updateLogEntry(supabase, 'log-1', input({ cost: 220 }));

    expect(on('expenses', 'insert')).toHaveLength(0);
    const updates = on('expenses', 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payload).toMatchObject({ amount: 220 });
    expect(updates[0]?.filters).toContainEqual(['id', 'expense-9']);
  });

  // Clearing the cost box means "this did not cost me that". Leaving the expense
  // behind would keep the money on the books with nothing pointing at it.
  it('soft-deletes the expense when the cost is taken off the entry', async () => {
    const { supabase, on } = fakeSupabase({ farm_id: 'farm-1', created_expense_id: 'expense-9' });
    await updateLogEntry(supabase, 'log-1', input({ cost: null }));

    const deletes = on('expenses', 'update').filter((op) => 'deleted_at' in (op.payload ?? {}));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.filters).toContainEqual(['id', 'expense-9']);
    expect(on('expenses', 'insert')).toHaveLength(0);
  });

  it('creates the expense when a cost is added to an entry that had none', async () => {
    const { supabase, on } = fakeSupabase({ farm_id: 'farm-1', created_expense_id: null });
    await updateLogEntry(supabase, 'log-1', input({ cost: 90 }));

    expect(on('expenses', 'insert')).toHaveLength(1);
    expect(
      on('log_entries', 'update').some(
        (op) => (op.payload as { created_expense_id?: string })?.created_expense_id === 'expense-1',
      ),
    ).toBe(true);
  });
});

// Deleting the entry takes its expense with it; deleting the expense leaves the
// entry standing (see deleteExpense in expenses.ts, tested there). The asymmetry
// is the founder's rule: the spray really happened.
describe('deleteLogEntry', () => {
  it('soft-deletes the entry and the expense it created', async () => {
    const { supabase, on } = fakeSupabase({ farm_id: 'farm-1', created_expense_id: 'expense-9' });
    const result = await deleteLogEntry(supabase, 'log-1');

    expect(result).toEqual({ ok: true });
    expect(on('log_entries', 'update')[0]?.payload).toHaveProperty('deleted_at');
    const expenseDeletes = on('expenses', 'update');
    expect(expenseDeletes).toHaveLength(1);
    expect(expenseDeletes[0]?.payload).toHaveProperty('deleted_at');
    expect(expenseDeletes[0]?.filters).toContainEqual(['id', 'expense-9']);
  });

  it('touches no expense when the entry never created one', async () => {
    const { supabase, on } = fakeSupabase({ farm_id: 'farm-1', created_expense_id: null });
    expect(await deleteLogEntry(supabase, 'log-1')).toEqual({ ok: true });
    expect(on('expenses', 'update')).toHaveLength(0);
  });
});
