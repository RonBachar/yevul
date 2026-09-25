import { describe, expect, it } from 'vitest';
import { farmProfitForecast } from './profit';

// צבירת הרווח ברמת המשק. הבדיקות כאן שומרות על ההחלטות שהמספר נשען
// עליהן, כי כולן בלתי נראות בקוד עצמו: הוצאת משק אינה נספרת, הוצאת
// חלקה כן, וחלקה בלי נתוני תחזית תורמת את ההוצאות שלה בלי לתרום הכנסה.

const plot = (expectedIncome: number | null, expenses: number) => ({ expectedIncome, expenses });

describe('farmProfitForecast', () => {
  it('sums expected income and plot expenses across plots', () => {
    const result = farmProfitForecast([plot(720000, 408000), plot(300000, 100000)], 0, true);
    expect(result.expectedIncome).toBe(1020000);
    expect(result.plotExpenses).toBe(508000);
    expect(result.profit).toBe(512000);
    expect(result.plotsWithForecast).toBe(2);
  });

  // **החלטת היזם 2026-09-25, מחליפה את זו של 2026-08-29.** הבדיקה הזו
  // אמרה עד היום את ההפך בדיוק, שהוצאה שלא שויכה לחלקה כן נספרת.
  //
  // מה שהשתנה הוא ההבנה מה הוצאה אומרת: קניית מלאי היא כסף שיצא מהכיס
  // אבל יושב במחסן, ואף חלקה לא חויבה עד שנצרך עליה משהו. המספר הזה
  // מודד רווחיות חלקות, ולכן קנייה לא שייכת לו.
  it('leaves farm expenses out of the profit entirely', () => {
    const result = farmProfitForecast([plot(720000, 400000)], 50000, true);
    expect(result.plotExpenses).toBe(400000);
    expect(result.profit).toBe(320000);
    expect(result.farmExpenses).toBe(50000);
  });

  // הסיבה שיש כאן בדיקה נפרדת ולא רק את זו שמעל: זו מנוסחת כזהות ולא
  // כמספרים, ולכן היא נשברת גם אם מישהו יחזיר את הכלל הישן וגם יעדכן
  // את המספרים למעלה כך שיסתדרו.
  it('keeps the hero equal to the sum of its plot cards', () => {
    const forecast = farmProfitForecast([plot(100000, 20000), plot(50000, 5000)], 30000, true);
    const sumOfCards = 100000 - 20000 + (50000 - 5000);
    expect(forecast.profit).toBe(sumOfCards);
  });

  // הוצאת משק אינה משנה את הרווח, ולו בשקל. זו הצורה הגסה ביותר של
  // אותה ערובה, והיא זו שתיפול ראשונה אם הכלל ייסוג.
  it('does not move the profit by a single shekel of farm expense', () => {
    const without = farmProfitForecast([plot(100000, 10000)], 0, true);
    const withFarm = farmProfitForecast([plot(100000, 10000)], 999999, true);
    expect(withFarm.profit).toBe(without.profit);
  });

  // חלקה שהחקלאי טרם הגדיר לה יבול ומחיר. אין לה הכנסה לחשב, אבל הכסף
  // שהוא כבר הוציא עליה אמיתי לגמרי, והשמטתו הייתה מנפחת את המספר.
  it('counts expenses of a plot that has no forecast, without inventing income', () => {
    const result = farmProfitForecast([plot(720000, 100000), plot(null, 80000)], 0, true);
    expect(result.expectedIncome).toBe(720000);
    expect(result.plotExpenses).toBe(180000);
    expect(result.plotsWithForecast).toBe(1);
    expect(result.plotsWithoutForecast).toBe(1);
  });

  // אותה הבחנה שקיימת ב-plotProfitForecast: היעדר רישום הוצאות אינו
  // אפס הוצאות, ורק הראשון מצדיק את חיווי ה-Wheat.
  it('separates a farm with no plot expenses recorded from one whose expenses are zero', () => {
    const untracked = farmProfitForecast([plot(720000, 0)], 0, false);
    const zero = farmProfitForecast([plot(720000, 0)], 0, true);
    expect(untracked.profit).toBe(zero.profit);
    expect(untracked.plotExpensesTracked).toBe(false);
    expect(zero.plotExpensesTracked).toBe(true);
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

  // **Profit is income minus plot expenses, and that is the whole of it.**
  // There were three cost lines here until 2026-09-10 -- the expenses, plus a
  // spray-cost and a work-cost line read straight off the journal rows -- and a
  // farmer who recorded a spray in the journal and also filed the material as an
  // expense paid for it twice on this screen. The journal writes an expense now
  // (see the money header in logEntries.ts), so every cost arrives through the
  // one list and cannot arrive through two.
  it('subtracts plot expenses and has no second cost line to subtract', () => {
    const result = farmProfitForecast([plot(100000, 20000)], 5000, true);
    expect(result.plotExpenses).toBe(20000);
    expect(result.profit).toBe(100000 - 20000);
    expect(result).not.toHaveProperty('sprayCosts');
    expect(result).not.toHaveProperty('workCosts');
  });

  // The guarantee stated as arithmetic: one recorded plot cost of 8000, however
  // it was entered, moves the profit by 8000 and never by 16000.
  it('moves the profit by a plot cost exactly once', () => {
    const before = farmProfitForecast([plot(100000, 0)], 0, true);
    const after = farmProfitForecast([plot(100000, 8000)], 0, true);
    expect(before.profit - after.profit).toBe(8000);
  });
});
