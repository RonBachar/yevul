import { useCallback, useMemo } from 'react';
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
  // Completed loads, for pull-to-refresh. **The minimum of the two hooks this
  // one composes, not their sum.** Both counters start at zero and every
  // refresh() here bumps both, so they move in step; taking the minimum means
  // the number only advances once the slower of the two queries has come back,
  // which is exactly when the spinner should stop. A sum would advance on the
  // first answer and pull the wheel away while half the card was still stale.
  loadCount: number;
};

// סכום ההוצאות של חלקה אחת, לכותרת צפי הרווח בפרטי חלקה. עוטף את
// useExpenses עם plotId, שכבר מצמצם במסד דרך expense_allocations!inner,
// כדי שהמסך לא יחזיק לוגיקת סכימה משלו.
//
// **loading נחשף בנפרד, ולא מקופל לתוך total, וזה תיקון של באג אמיתי.**
// הגרסה הראשונה החזירה null בזמן טעינה, ו-plotProfitForecast מפרש null
// כ"אין מעקב הוצאות". התוצאה הייתה שבכל פתיחת חלקה שיש בה הוצאות,
// עד שהשאילתה חזרה, המסך הציג "עדיין לא נרשמו הוצאות" יחד עם רווח
// ששווה להכנסה המלאה. כלומר הוא לא הבהב מספר שגוי, הוא הבהב **הצהרה
// כספית שקרית**, וזה גרוע יותר. המסך מסתיר את הכותרת בזמן טעינה במקום
// לנחש. נמצא בקוד ריוויו של שלב 4.
//
// plotId יכול להיות null רק כשהנתיב עצמו פגום (הווב גוזר אותו
// מ-useParams). במקרה כזה מוחזר null בלי לגעת בתוצאה, כדי שלא ייווצר
// מצב שבו היעדר חלקה נקרא בטעות כ"כל הוצאות המשק".
export function usePlotExpensesTotal(
  supabase: SupabaseClient,
  plotId: string | null,
): { total: number | null; loading: boolean; refresh: () => void; loadCount: number } {
  const { loading, failed, expenses, refresh, loadCount } = useExpenses(
    supabase,
    plotId ?? undefined,
  );
  const total = useMemo(
    () =>
      plotId == null || loading || failed
        ? null
        : expenses.reduce((sum, expense) => sum + expense.amount, 0),
    [plotId, loading, failed, expenses],
  );
  // ממוזכר, ולא אובייקט literal חדש בכל רינדור, מאותו נימוק שמפורט
  // ב-useFarmProfit: קורא שישים את התוצאה בתלויות של אפקט יקבל זהות
  // חדשה בכל רינדור ויסתובב בלולאה.
  return useMemo(
    () => ({ total, loading, refresh, loadCount }),
    [total, loading, refresh, loadCount],
  );
}

export function useFarmProfit(supabase: SupabaseClient): FarmProfitState {
  const plotsState = usePlots(supabase);
  const expensesState = useExpenses(supabase);

  // **הפירוק לשדות בודדים אינו סגנוני, הוא מה שמונע לולאת רינדור
  // אינסופית.** usePlots ו-useExpenses מחזירים אובייקט חדש בכל רינדור
  // (הם בונים אותו literal ולא ממוזכר), ולכן useMemo שתלוי באובייקט
  // עצמו לעולם אינו פוגע, וכל ערך שנוצר בתוכו, ובכללו refresh, מקבל
  // זהות חדשה בכל רינדור. מסך שקורא useFocusEffect עם refresh בתלויות
  // היה מזהה שינוי בכל רינדור, קורא ל-refresh, גורם לרינדור, וחוזר
  // חלילה. זה בדיוק מה שקרה במסך הבית וב-PlotsScreen.
  //
  // המערכים והדגלים כאן מגיעים מ-setState ולכן יציבים בין רינדורים
  // כשהנתונים לא השתנו, ושתי פונקציות ה-refresh כבר עטופות ב-useCallback
  // ריק במקורן, כלומר יציבות מלכתחילה.
  const { plots: rawPlots, loading: plotsLoading, failed: plotsFailed, farmId } = plotsState;
  const { expenses, loading: expensesLoading, failed: expensesFailed } = expensesState;
  const refreshPlots = plotsState.refresh;
  const refreshExpenses = expensesState.refresh;
  const loadCount = Math.min(plotsState.loadCount, expensesState.loadCount);

  const refresh = useCallback(() => {
    refreshPlots();
    refreshExpenses();
  }, [refreshPlots, refreshExpenses]);

  return useMemo(() => {
    const expensesByPlot = new Map<string, number>();
    let generalExpenses = 0;
    for (const expense of expenses) {
      if (expense.plotId) {
        expensesByPlot.set(
          expense.plotId,
          (expensesByPlot.get(expense.plotId) ?? 0) + expense.amount,
        );
      } else {
        generalExpenses += expense.amount;
      }
    }

    const plots: PlotProfitRow[] = rawPlots.map((plot) => {
      const plotExpenses = expensesByPlot.get(plot.id) ?? 0;
      return {
        ...plot,
        expenses: plotExpenses,
        forecast: plotProfitForecast(plot.area, plot.cropCycle, plotExpenses),
      };
    });

    const forecast = farmProfitForecast(
      plots.map((plot) => ({
        expectedIncome: plot.forecast?.expectedIncome ?? null,
        expenses: plot.expenses,
      })),
      generalExpenses,
      expenses.length > 0,
    );

    return {
      loading: plotsLoading || expensesLoading,
      failed: plotsFailed || expensesFailed,
      farmId,
      forecast,
      plots,
      renderable: plots.length === 0 || forecast.plotsWithForecast > 0,
      refresh,
      loadCount,
    };
  }, [
    rawPlots,
    expenses,
    plotsLoading,
    plotsFailed,
    expensesLoading,
    expensesFailed,
    farmId,
    refresh,
    loadCount,
  ]);
}
