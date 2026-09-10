import { describe, expect, it } from 'vitest';
import { farmProfitForecast } from './profit';

// צבירת הרווח ברמת המשק, שלב 4. הבדיקות כאן שומרות על שתי ההחלטות
// שהמספר הזה נשען עליהן, כי שתיהן בלתי נראות בקוד עצמו: הוצאה שלא
// שויכה לחלקה כן נספרת, וחלקה בלי נתוני תחזית תורמת את ההוצאות שלה
// בלי לתרום הכנסה.

const plot = (expectedIncome: number | null, expenses: number) => ({ expectedIncome, expenses });

describe('farmProfitForecast', () => {
  it('sums expected income and expenses across plots', () => {
    const result = farmProfitForecast([plot(720000, 408000), plot(300000, 100000)], 0, true);
    expect(result.expectedIncome).toBe(1020000);
    expect(result.expenses).toBe(508000);
    expect(result.profit).toBe(512000);
    expect(result.plotsWithForecast).toBe(2);
  });

  // החלטת היזם 2026-08-29. ארנונה או ביטוח לא שייכים לחלקה אחת, והשורה
  // התחתונה של המשק חייבת לכלול אותם, אחרת המספר ורוד מדי.
  it('counts expenses that were never allocated to a plot', () => {
    const result = farmProfitForecast([plot(720000, 400000)], 50000, true);
    expect(result.expenses).toBe(450000);
    expect(result.profit).toBe(270000);
    expect(result.generalExpenses).toBe(50000);
  });

  // הפער המכוון בין ה-Hero לסכום כרטיסי החלקות. נחשף כשדה כדי שהתצוגה
  // תסביר אותו, ולא תיראה כמו באג חשבוני.
  it('exposes general expenses separately so the hero can explain the gap', () => {
    const withGeneral = farmProfitForecast([plot(100000, 0)], 30000, true);
    const plotsOnly =
      withGeneral.expectedIncome - (withGeneral.expenses - withGeneral.generalExpenses);
    expect(plotsOnly).toBe(100000);
    expect(withGeneral.profit).toBe(70000);
  });

  // חלקה שהחקלאי טרם הגדיר לה יבול ומחיר. אין לה הכנסה לחשב, אבל הכסף
  // שהוא כבר הוציא עליה אמיתי לגמרי, והשמטתו הייתה מנפחת את המספר.
  it('counts expenses of a plot that has no forecast, without inventing income', () => {
    const result = farmProfitForecast([plot(720000, 100000), plot(null, 80000)], 0, true);
    expect(result.expectedIncome).toBe(720000);
    expect(result.expenses).toBe(180000);
    expect(result.plotsWithForecast).toBe(1);
    expect(result.plotsWithoutForecast).toBe(1);
  });

  // אותה הבחנה שקיימת ב-plotProfitForecast: היעדר רישום הוצאות אינו
  // אפס הוצאות, ורק הראשון מצדיק את חיווי ה-Wheat.
  it('separates a farm with no expenses recorded from one whose expenses are zero', () => {
    const untracked = farmProfitForecast([plot(720000, 0)], 0, false);
    const zero = farmProfitForecast([plot(720000, 0)], 0, true);
    expect(untracked.profit).toBe(zero.profit);
    expect(untracked.expensesTracked).toBe(false);
    expect(zero.expensesTracked).toBe(true);
  });

  // עובד: עמודות התחזית ממוסכות ל-null והוא חסום מטבלאות הכסף, ולכן
  // הוא מגיע לכאן עם חלקות ובלי אף הכנסה. אפס חלקות עם תחזית הוא
  // הסימן שהתצוגה בודקת כדי לא לרנדר את הכרטיס בכלל.
  it('reports no forecastable plots when every forecast column is masked', () => {
    const result = farmProfitForecast([plot(null, 0), plot(null, 0)], 0, false);
    expect(result.plotsWithForecast).toBe(0);
    expect(result.expectedIncome).toBe(0);
  });

  it('handles a farm with no plots at all', () => {
    const result = farmProfitForecast([], 0, false);
    expect(result.profit).toBe(0);
    expect(result.plotsWithForecast).toBe(0);
  });

  // **Profit is income minus expenses, and that is the whole of it.** Founder's
  // decision 2026-09-10. There were three cost lines here until today -- the
  // expenses, plus a spray-cost and a work-cost line read straight off the journal
  // rows -- and a farmer who recorded a spray in the journal and also filed the
  // material as an expense paid for it twice on this screen. The journal writes an
  // expense now (see the money header in logEntries.ts), so every cost arrives
  // through the one list and cannot arrive through two.
  it('subtracts expenses and has no second cost line to subtract', () => {
    const result = farmProfitForecast([plot(100000, 20000)], 5000, true);
    expect(result.expenses).toBe(25000);
    expect(result.profit).toBe(100000 - 25000);
    expect(result).not.toHaveProperty('sprayCosts');
    expect(result).not.toHaveProperty('workCosts');
  });

  // The guarantee stated as arithmetic: one recorded cost of 8000, however it was
  // entered, moves the profit by 8000 and never by 16000.
  it('moves the profit by a cost exactly once', () => {
    const before = farmProfitForecast([plot(100000, 0)], 0, true);
    const after = farmProfitForecast([plot(100000, 8000)], 0, true);
    expect(before.profit - after.profit).toBe(8000);
  });
});
