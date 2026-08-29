import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useExpenses } from './expenses';
import {
  plotProfitForecast,
  usePlots,
  type PlotProfitForecast,
  type PlotWithCropCycle,
} from './plots';

// צבירת רווח ברמת המשק, שלב 4, docs/roadmap.md, "Live P&L Hero Card".
//
// עד כאן החישוב היה קיים אבל מנותק: plotProfitForecast נבנה בשלב 3 עם
// טסטים, ושני מסכי פרטי החלקה קראו לו עם `null` כהוצאות, כי מעקב
// ההוצאות עוד לא היה. מאז ההוצאות נבנו, וה-`null` ההוא הפך לשקר,
// המסך הציג צפי רווח ששווה להכנסה המלאה. הקובץ הזה מחבר את שני הצדדים
// ומגיש אותם לשלושת המקומות שמציגים מספר רווח: כרטיס הבית, כרטיס
// החלקה ברשימה, וכותרת פרטי החלקה.
//
// **החלטת מוצר, החלטת היזם 2026-08-29: המספר של המשק סופר את כל
// הוצאות המשק, גם כאלה שלא שויכו לאף חלקה** (ארנונה, ביטוח, משכורת).
// זו השורה התחתונה האמיתית של המשק. המחיר הוא ש-Hero אינו בהכרח סכום
// כרטיסי החלקות שמתחתיו, ולכן generalExpenses נחשף בנפרד כאן, כדי
// שהתצוגה תוכל להסביר את הפער במקום להיראות כמו באג.

export type FarmProfitForecast = {
  expectedIncome: number;
  expenses: number;
  profit: number;
  // האם נרשמה בכלל הוצאה אחת במשק. אותה הבחנה בדיוק שקיימת
  // ב-PlotProfitForecast: "לא נרשמו הוצאות" הוא חוסר ידיעה, "אפס
  // הוצאות" הוא עובדה, ורק הראשון מצדיק את חיווי ה-Wheat.
  expensesTracked: boolean;
  // הוצאות שלא שויכו לאף חלקה. נכנסות ל-expenses אבל לא לאף כרטיס.
  generalExpenses: number;
  plotsWithForecast: number;
  plotsWithoutForecast: number;
};

export type PlotProfitRow = PlotWithCropCycle & {
  expenses: number;
  forecast: PlotProfitForecast | null;
};

// ============================================================
// הצבירה עצמה, פונקציה טהורה. חלקה בלי נתוני תחזית לא תורמת הכנסה
// (אין מה לחשב), אבל **ההוצאות שלה כן נספרות**, אחרת המספר של המשק
// היה מנופח בדיוק בסכום שהחקלאי הוציא על החלקות שטרם הגדיר להן צפי.
// ============================================================

export function farmProfitForecast(
  plots: { expectedIncome: number | null; expenses: number }[],
  generalExpenses: number,
  expensesTracked: boolean,
): FarmProfitForecast {
  let expectedIncome = 0;
  let expenses = generalExpenses;
  let plotsWithForecast = 0;
  let plotsWithoutForecast = 0;

  for (const plot of plots) {
    expenses += plot.expenses;
    if (plot.expectedIncome == null) {
      plotsWithoutForecast += 1;
      continue;
    }
    plotsWithForecast += 1;
    expectedIncome += plot.expectedIncome;
  }

  return {
    expectedIncome,
    expenses,
    profit: expectedIncome - expenses,
    expensesTracked,
    generalExpenses,
    plotsWithForecast,
    plotsWithoutForecast,
  };
}

// ============================================================
// ההוק. אינו יורה שום שאילתה משלו: הוא מרכיב את usePlots ואת
// useExpenses, ששניהם כבר טוענים בדיוק את מה שצריך (חלקות עם
// crop_cycle נוכחי, והוצאות המשק עם ההקצאה שלהן). המיזוג טהור,
// ב-useMemo, ולכן אין כאן סבב רשת נוסף ואין עותק שני של לוגיקת
// "העונה הנוכחית" שיושבת ב-usePlots.
// ============================================================

export type FarmProfitState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  forecast: FarmProfitForecast;
  plots: PlotProfitRow[];
  // עובד רואה את עמודות התחזית ממוסכות ל-null ב-crop_cycles_view,
  // וחסום ברמת השורה מטבלאות הכסף, ולכן יוצא מכאן עם חלקות אבל בלי
  // אף הכנסה. design.md, Worker Mode: הכרטיס פשוט לא מרונדר. זו אותה
  // אכיפה בשכבת השאילתה שהמסמך דורש, ולא תנאי UI על תפקיד.
  //
  // משק חדש לגמרי (בלי חלקות בכלל) הוא מצב אחר, ושם design.md דווקא
  // כן דורש כרטיס עם ₪0 ב-Ink-900. שני המצבים נבדלים כאן ב-plots.length.
  renderable: boolean;
  refresh: () => void;
};

// סכום ההוצאות של חלקה אחת, לכותרת צפי הרווח בפרטי חלקה. עוטף את
// useExpenses עם plotId, שכבר מצמצם במסד דרך expense_allocations!inner,
// כדי שהמסך לא יחזיק לוגיקת סכימה משלו. מחזיר null בזמן טעינה או כשל,
// וזה בדיוק מה ש-plotProfitForecast מבין כ"אין מעקב", כך שהמסך לא
// מהבהב מספר שגוי לרגע לפני שההוצאות הגיעו.
// plotId יכול להיות null רק כשהנתיב עצמו פגום (הווב גוזר אותו
// מ-useParams). במקרה כזה מוחזר null בלי לגעת בתוצאה, כדי שלא ייווצר
// מצב שבו היעדר חלקה נקרא בטעות כ"כל הוצאות המשק".
export function usePlotExpensesTotal(
  supabase: SupabaseClient,
  plotId: string | null,
): { total: number | null; refresh: () => void } {
  const { loading, failed, expenses, refresh } = useExpenses(supabase, plotId ?? undefined);
  const total = useMemo(
    () =>
      plotId == null || loading || failed
        ? null
        : expenses.reduce((sum, expense) => sum + expense.amount, 0),
    [plotId, loading, failed, expenses],
  );
  return { total, refresh };
}

export function useFarmProfit(supabase: SupabaseClient): FarmProfitState {
  const plotsState = usePlots(supabase);
  const expensesState = useExpenses(supabase);

  return useMemo(() => {
    const expensesByPlot = new Map<string, number>();
    let generalExpenses = 0;
    for (const expense of expensesState.expenses) {
      if (expense.plotId) {
        expensesByPlot.set(
          expense.plotId,
          (expensesByPlot.get(expense.plotId) ?? 0) + expense.amount,
        );
      } else {
        generalExpenses += expense.amount;
      }
    }

    const plots: PlotProfitRow[] = plotsState.plots.map((plot) => {
      const expenses = expensesByPlot.get(plot.id) ?? 0;
      return {
        ...plot,
        expenses,
        forecast: plotProfitForecast(plot.area, plot.cropCycle, expenses),
      };
    });

    const forecast = farmProfitForecast(
      plots.map((plot) => ({
        expectedIncome: plot.forecast?.expectedIncome ?? null,
        expenses: plot.expenses,
      })),
      generalExpenses,
      expensesState.expenses.length > 0,
    );

    return {
      loading: plotsState.loading || expensesState.loading,
      failed: plotsState.failed || expensesState.failed,
      farmId: plotsState.farmId,
      forecast,
      plots,
      renderable: plots.length === 0 || forecast.plotsWithForecast > 0,
      refresh: () => {
        plotsState.refresh();
        expensesState.refresh();
      },
    };
  }, [plotsState, expensesState]);
}
