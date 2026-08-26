import { describe, expect, it } from 'vitest';
import {
  createLogEntry,
  LOG_ENTRY_TYPES,
  logEntryTypeLabelKey,
  type LogEntryInput,
} from './logEntries';

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
