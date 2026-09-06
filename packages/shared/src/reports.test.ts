import { describe, expect, it } from 'vitest';
import { expensesCsv, journalCsv, profitabilityCsv, toCsv } from './reports';
import type { Expense } from './expenses';
import type { LogEntry } from './logEntries';
import type { PlotProfitRow } from './profit';

// ייצוא דוחות, שלב 4, prd.md סעיף 10.

const BOM = '﻿';
const lines = (csv: string) => csv.replace(BOM, '').split('\r\n');

// גישה לשורה לפי אינדקס תחת noUncheckedIndexedAccess. נכשל במפורש
// במקום להחזיר undefined ולהפיל את הבדיקה במקום מבלבל.
function line(csv: string, index: number): string {
  const value = lines(csv)[index];
  if (value === undefined) throw new Error(`no CSV line at index ${index}`);
  return value;
}

// שורת נתונים, כלומר אחרי שורת הכותרות.
function bodyLine(csv: string, index: number): string {
  return line(csv, index + 1);
}

describe('toCsv', () => {
  // בלי ה-BOM אקסל בחלונות פותח UTF-8 בקידוד המקומי ומציג עברית
  // כג'יבריש, וזה הפורמט שרואה חשבון פותח בפועל.
  it('starts with a BOM so Excel reads Hebrew correctly', () => {
    expect(toCsv([['חלקה']]).startsWith(BOM)).toBe(true);
  });

  it('separates rows with CRLF, per RFC 4180 and what Excel expects', () => {
    expect(toCsv([['a'], ['b']])).toBe(`${BOM}a\r\nb`);
  });

  // הבדיקה החשובה ביותר כאן: תא שמכיל פסיק היה שובר את כל מבנה
  // הקובץ ומזיז עמודות אצל רואה החשבון בלי להתריע.
  it('quotes cells containing a comma, a quote or a newline', () => {
    expect(toCsv([['דשן, אורגני']])).toBe(`${BOM}"דשן, אורגני"`);
    expect(toCsv([['שורה\nשנייה']])).toBe(`${BOM}"שורה\nשנייה"`);
  });

  it('doubles inner quotes rather than dropping them', () => {
    expect(toCsv([['חומר "אקסטרה"']])).toBe(`${BOM}"חומר ""אקסטרה"""`);
  });

  it('leaves ordinary cells unquoted', () => {
    expect(toCsv([['דשן', '450']])).toBe(`${BOM}דשן,450`);
  });
});

function plotRow(overrides: Partial<PlotProfitRow> = {}): PlotProfitRow {
  return {
    id: 'p1',
    farmId: 'f1',
    name: 'חלקה צפונית',
    area: 40,
    areaUnit: 'dunam',
    responsibleUserId: null,
    cropCycle: null,
    expenses: 0,
    sprayCost: 0,
    workCost: 0,
    forecast: null,
    ...overrides,
  };
}

const forecast = (expectedIncome: number, expenses: number) => ({
  expectedIncome,
  expenses,
  sprayCost: 0,
  workCost: 0,
  expensesTracked: true,
  profit: expectedIncome - expenses,
});

describe('profitabilityCsv', () => {
  it('sorts plots from most to least profitable, per prd.md', () => {
    const report = profitabilityCsv(
      [
        plotRow({ id: 'a', name: 'נמוכה', expenses: 500, forecast: forecast(1000, 500) }),
        plotRow({ id: 'b', name: 'גבוהה', expenses: 100, forecast: forecast(9000, 100) }),
      ],
      'ILS',
    );
    expect(bodyLine(report.csv, 0).startsWith('גבוהה')).toBe(true);
    expect(bodyLine(report.csv, 1).startsWith('נמוכה')).toBe(true);
  });

  // חלקה בלי תחזית עדיין הוציאה כסף אמיתי. השמטתה הייתה מסתירה
  // מהחקלאי הוצאה שהוא באמת שילם.
  it('keeps a plot with no forecast, with empty income and real expenses, at the end', () => {
    const report = profitabilityCsv(
      [
        plotRow({ id: 'a', name: 'בלי תחזית', expenses: 800, forecast: null }),
        plotRow({ id: 'b', name: 'עם תחזית', expenses: 100, forecast: forecast(9000, 100) }),
      ],
      'ILS',
    );
    expect(bodyLine(report.csv, 1)).toContain('בלי תחזית');
    expect(bodyLine(report.csv, 1).split(',')).toEqual(['בלי תחזית', '', '', '40', '', '800', '']);
  });

  // הקובץ נועד לייבוא, ו-"₪1,234.5" אינו מספר.
  it('writes raw numbers, with the currency in the header instead', () => {
    const report = profitabilityCsv(
      [plotRow({ expenses: 500, forecast: forecast(1234.5, 500) })],
      'ILS',
    );
    expect(line(report.csv, 0)).toContain('₪');
    expect(bodyLine(report.csv, 0)).toContain('1234.5');
    expect(bodyLine(report.csv, 0)).not.toContain('₪');
  });
});

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    farmId: 'f1',
    amount: 450,
    name: 'דשן',
    date: '2026-08-01',
    note: null,
    source: 'manual',
    plotId: null,
    receiptPath: null,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('expensesCsv', () => {
  const names = new Map([['p1', 'חלקה צפונית']]);

  // תווית מפורשת ולא תא ריק, כדי שרואה החשבון לא יחשוב שחסר נתון.
  it('labels an unallocated expense explicitly instead of leaving a blank cell', () => {
    const report = expensesCsv([expense({ plotId: null })], names, 'ILS');
    expect(bodyLine(report.csv, 0)).toContain('כללי, ללא חלקה');
  });

  it('reports whether a receipt is attached', () => {
    const withReceipt = expensesCsv([expense({ receiptPath: 'f1/e1.jpg' })], names, 'ILS');
    const without = expensesCsv([expense()], names, 'ILS');
    expect(bodyLine(withReceipt.csv, 0)).toContain('כן');
    expect(bodyLine(without.csv, 0)).toContain('לא');
  });

  // prd.md: "כל הדוחות מקובצים לפי חלקה. זה עיקרון ולא בחירה עיצובית".
  it('groups rows by plot, then by date', () => {
    const report = expensesCsv(
      [
        expense({ id: '1', plotId: 'p1', date: '2026-08-05', name: 'שני' }),
        expense({ id: '2', plotId: null, name: 'כללי' }),
        expense({ id: '3', plotId: 'p1', date: '2026-08-01', name: 'ראשון' }),
      ],
      names,
      'ILS',
    );
    expect(bodyLine(report.csv, 0)).toContain('ראשון');
    expect(bodyLine(report.csv, 1)).toContain('שני');
    expect(bodyLine(report.csv, 2)).toContain('כללי');
  });
});

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'l1',
    farmId: 'f1',
    plotId: 'p1',
    date: '2026-08-20',
    type: 'spray',
    note: null,
    source: 'manual',
    sprayPest: 'כנימה',
    sprayMaterial: 'שמן',
    sprayDose: '2%',
    sprayPhiDays: 7,
    sprayQuantity: null,
    sprayQuantityUnit: null,
    sprayUnitPrice: null,
    sprayCost: null,
    workHours: null,
    workHourlyRate: null,
    workCost: null,
    harvestQty: null,
    harvestUnit: null,
    createdAt: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

describe('journalCsv', () => {
  const names = new Map([['p1', 'חלקה צפונית']]);

  // השדה שהרגולטור באמת בודק. נגזר ולא נשמר (prd.md נספח א.3), ולכן
  // הוא חייב להיות מחושב בזמן הייצוא ולא רק מוצג במסך.
  it('derives the safe-harvest date into the file', () => {
    const report = journalCsv([entry()], names, 'spray-log');
    expect(bodyLine(report.csv, 0)).toContain('2026-08-27');
  });

  it('leaves the safe-harvest cell empty when there are no PHI days', () => {
    const report = journalCsv([entry({ sprayPhiDays: null })], names, 'journal');
    expect(bodyLine(report.csv, 0).split(',')[7]).toBe('');
  });

  it('sorts newest first', () => {
    const report = journalCsv(
      [entry({ id: 'a', date: '2026-08-01' }), entry({ id: 'b', date: '2026-08-20' })],
      names,
      'journal',
    );
    expect(bodyLine(report.csv, 0)).toContain('2026-08-20');
    expect(bodyLine(report.csv, 1)).toContain('2026-08-01');
  });

  it('joins harvest quantity with its unit', () => {
    const report = journalCsv(
      [entry({ type: 'harvest', harvestQty: 300, harvestUnit: 'ק"ג', sprayPhiDays: null })],
      names,
      'journal',
    );
    expect(bodyLine(report.csv, 0)).toContain('300 ק""ג');
  });
});
