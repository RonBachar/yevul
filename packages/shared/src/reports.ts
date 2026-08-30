import { currencySymbol } from './format';
import { t } from './i18n';
import { logEntryTypeLabelKey, type LogEntry } from './logEntries';
import { safeHarvestDate } from './safeHarvestDate';
import type { Expense } from './expenses';
import type { PlotProfitRow } from './profit';
import type { Currency } from './settings';

// ייצוא דוחות, שלב 4, docs/roadmap.md. prd.md סעיף 10 מגדיר שלושה
// דוחות: רווחיות (לחקלאי), שנתי (לרואה החשבון), ויומן (לרגולטור או
// לחברת הייצוא). לפי סעיף 12 זהו פיצ'ר ווב בלבד.
//
// **הדוח השנתי המלא לא נבנה כאן, וזו לא השמטה.** prd.md דורש פילוח
// "לפי קטגוריה", אבל אין קטגוריות במוצר: בשלב 3 נדחה בורר הקטגוריות
// בבקשה מפורשת של עידו, ועמודת category במסד מחזיקה היום את שם
// ההוצאה כטקסט חופשי (ראה expenses.ts). בנוסף, "תיקיית הקבלות"
// שבאותו סעיף דורשת אריזת ZIP, כלומר תלות חדשה. שניהם ממתינים
// להחלטה נפרדת. מה שנבנה הוא שלושת הייצואים שכל הנתונים להם כבר
// קיימים ובדוקים.
//
// **כל הפונקציות כאן טהורות ומקבלות נתונים שכבר נטענו.** אין כאן
// שאילתות ואין הוקים, כדי שהן יהיו בדיקות במלואן ושהמסך שכבר מחזיק
// את הנתונים לא ימשוך אותם שוב רק כדי לייצא.

// ============================================================
// CSV.
//
// **ה-BOM אינו קישוט.** בלעדיו Excel בחלונות פותח UTF-8 בקידוד
// המקומי ומציג עברית כג'יבריש, וזה הפורמט שרואה חשבון פותח בפועל.
// שורות מסתיימות ב-CRLF מאותה משפחת סיבות (RFC 4180, ומה שאקסל
// מצפה לו).
// ============================================================

const BOM = '﻿';

function escapeCell(value: string): string {
  // ציטוט נדרש רק כשיש תו מפריד, מרכאות או שורה חדשה. מרכאות פנימיות
  // מוכפלות, לפי RFC 4180.
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

// מספרים נכתבים גולמיים ולא מפורמטים: הקובץ נועד לייבוא למערכת של
// רואה החשבון, ו-"₪1,234.5" אינו מספר. סימן המטבע מופיע בכותרת
// העמודה במקום.
function numberCell(value: number | null): string {
  return value == null ? '' : String(value);
}

function amountHeader(key: string, currency: Currency): string {
  return `${t(key)} (${currencySymbol(currency)})`;
}

export type CsvReport = { filename: string; csv: string };

// ============================================================
// דוח רווחיות, prd.md: "כל חלקה, הכנסה צפויה פחות הוצאה בפועל,
// מסודר מהרווחית ביותר לגרועה ביותר".
//
// חלקה בלי נתוני תחזית **כן מופיעה** בדוח, עם הכנסה ורווח ריקים
// והוצאות אמיתיות, ויורדת לסוף. השמטתה הייתה מסתירה מהחקלאי כסף
// שהוא באמת הוציא, וזו בדיוק הטעות שהמספר בכרטיס הבית כבר נזהר
// ממנה (ראה profit.ts).
// ============================================================

export function profitabilityCsv(plots: PlotProfitRow[], currency: Currency): CsvReport {
  const sorted = [...plots].sort((a, b) => {
    if (!a.forecast && !b.forecast) return 0;
    if (!a.forecast) return 1;
    if (!b.forecast) return -1;
    return b.forecast.profit - a.forecast.profit;
  });

  const rows: string[][] = [
    [
      t('report.column.plot'),
      t('report.column.crop'),
      t('report.column.season'),
      t('report.column.area'),
      amountHeader('report.column.expectedIncome', currency),
      amountHeader('report.column.expenses', currency),
      amountHeader('report.column.profitForecast', currency),
    ],
  ];

  for (const plot of sorted) {
    rows.push([
      plot.name,
      plot.cropCycle?.name ?? '',
      plot.cropCycle?.season ?? '',
      numberCell(plot.area),
      numberCell(plot.forecast?.expectedIncome ?? null),
      numberCell(plot.expenses),
      numberCell(plot.forecast?.profit ?? null),
    ]);
  }

  return { filename: 'profitability', csv: toCsv(rows) };
}

// ============================================================
// דוח הוצאות, החלק מהדוח השנתי שכן ניתן לבנייה היום. מקובץ לפי
// חלקה, prd.md: "כל הדוחות מקובצים לפי חלקה. זה עיקרון ולא בחירה
// עיצובית". הוצאה בלי חלקה מקבלת תווית מפורשת ולא תא ריק, כדי
// שרואה החשבון יראה שהיא כללית ולא יחשוב שחסר נתון.
// ============================================================

export function expensesCsv(
  expenses: Expense[],
  plotNames: Map<string, string>,
  currency: Currency,
): CsvReport {
  const plotLabel = (plotId: string | null) =>
    plotId ? (plotNames.get(plotId) ?? '') : t('report.generalExpense');

  const sorted = [...expenses].sort((a, b) => {
    const byPlot = plotLabel(a.plotId).localeCompare(plotLabel(b.plotId), 'he');
    return byPlot !== 0 ? byPlot : a.date.localeCompare(b.date);
  });

  const rows: string[][] = [
    [
      t('report.column.plot'),
      t('report.column.date'),
      t('report.column.expenseName'),
      amountHeader('report.column.amount', currency),
      t('report.column.receipt'),
      t('report.column.note'),
    ],
  ];

  for (const expense of sorted) {
    rows.push([
      plotLabel(expense.plotId),
      expense.date,
      expense.name ?? '',
      numberCell(expense.amount),
      expense.receiptPath ? t('report.yes') : t('report.no'),
      expense.note ?? '',
    ]);
  }

  return { filename: 'expenses', csv: toCsv(rows) };
}

// ============================================================
// דוח יומן, prd.md: "לרגולטור או לחברת הייצוא. רשומות הריסוס בלבד,
// או היומן המלא". אותה פונקציה משרתת את שניהם, כי ההבדל הוא בסינון
// שכבר קרה במסד (useLogEntries עם type) ולא במבנה העמודות.
//
// **"בטוח לקטיף" נגזר ולא נשמר**, לפי prd.md נספח א.3, ולכן הוא
// מחושב כאן בזמן הייצוא מאותה פונקציה שהמסכים משתמשים בה. זהו
// השדה שהרגולטור באמת בודק, והוא חייב להיות בקובץ ולא רק במסך.
// ============================================================

export function journalCsv(
  entries: LogEntry[],
  plotNames: Map<string, string>,
  filename: string,
): CsvReport {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const rows: string[][] = [
    [
      t('report.column.date'),
      t('report.column.type'),
      t('report.column.plot'),
      t('report.column.pest'),
      t('report.column.material'),
      t('report.column.dose'),
      t('report.column.phiDays'),
      t('report.column.safeHarvest'),
      t('report.column.harvestQty'),
      t('report.column.note'),
    ],
  ];

  for (const entry of sorted) {
    rows.push([
      entry.date,
      t(logEntryTypeLabelKey(entry.type)),
      entry.plotId ? (plotNames.get(entry.plotId) ?? '') : '',
      entry.sprayPest ?? '',
      entry.sprayMaterial ?? '',
      entry.sprayDose ?? '',
      numberCell(entry.sprayPhiDays),
      safeHarvestDate(entry.date, entry.sprayPhiDays) ?? '',
      entry.harvestQty == null
        ? ''
        : `${entry.harvestQty}${entry.harvestUnit ? ` ${entry.harvestUnit}` : ''}`,
      entry.note ?? '',
    ]);
  }

  return { filename, csv: toCsv(rows) };
}
