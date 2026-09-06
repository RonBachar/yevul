import { describe, expect, it } from 'vitest';
import {
  createLogEntry,
  initialLogEntryType,
  LOG_ENTRY_TYPES,
  logEntryTypeLabelKey,
  saveSprayPrice,
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
    sprayCost: null,
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
    sprayCost: null,
    harvestQty: null,
    harvestUnit: null,
    ...overrides,
  };
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
