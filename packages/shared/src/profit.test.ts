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

  // Spray material cost lowers the profit (founder's decision 2026-09-04), as a
  // distinct line so `expenses` still equals the expense list and does not
  // double-count.
  it('subtracts spray costs from profit without folding them into expenses', () => {
    const result = farmProfitForecast([plot(100000, 20000)], 5000, true, 8000);
    expect(result.expenses).toBe(25000);
    expect(result.sprayCosts).toBe(8000);
    expect(result.profit).toBe(100000 - 25000 - 8000);
  });

  it('leaves spray costs at zero when none are passed', () => {
    const result = farmProfitForecast([plot(100000, 0)], 0, true);
    expect(result.sprayCosts).toBe(0);
    expect(result.profit).toBe(100000);
  });
});
