import { describe, expect, it } from 'vitest';
import {
  createLogEntry,
  initialLogEntryType,
  LOG_ENTRY_TYPES,
  logEntryTypeLabelKey,
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
