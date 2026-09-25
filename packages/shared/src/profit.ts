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
// **החלטת מוצר, 2026-09-25, מחליפה את זו של 2026-08-29:
// צפי הרווח נגזר מהחלקות בלבד.** קודם הוא ספר גם הוצאות שלא שויכו לאף
// חלקה, ארנונה וביטוח ומשכורת, בהחלטה מפורשת של היזם, ו-Hero לא היה
// סכום כרטיסי החלקות שמתחתיו.
//
// מה שהשתנה הוא לא ההעדפה אלא ההבנה מה הוצאה בכלל אומרת. **קנייה איננה
// צריכה:** חומר ריסוס בעשרת אלפים שקל יצא מהכיס אבל יושב במחסן, ויכול
// לשבת שם גם לעונה הבאה, ואף חלקה לא חויבה. החלקה מחויבת רק כשהחומר
// נצרך עליה, בכמות. ראה docs/spec-money-and-tasks.md סעיף 1.
//
// ולכן שני מספרים, ורק אחד מהם מחשב. `plotExpenses` הוא צריכה בפועל
// ונכנס לרווח. `farmExpenses` הוא כל השאר, מוצג לחקלאי כאומדן ולא נוגע
// בשום חישוב. **שני הספרים אינם אמורים להסתדר זה מול זה, וזו לא תקלה,**
// והניסיון לגשר ביניהם הוא מה שהפיל את התכנון שבועות.
//
// התוצאה הנלווית היא ש-Hero כן שווה עכשיו לסכום כרטיסי החלקות, ולכן
// שורת ההסבר שהצדיקה את הפער נמחקה ולא הוחלפה.
//
// **צפי רווח = הכנסה פחות הוצאות. שורת עלות אחת, מ-2026-09-10.** קודם היו כאן
// שלוש: ההוצאות, ועוד sprayCosts ו-workCosts שנקראו ישירות מעמודות קפואות על
// שורות היומן. חקלאי שרשם ריסוס ביומן וגם רשם את אותו חומר כהוצאה חויב עליו
// פעמיים, ושום דבר לא מנע את זה. היומן כבר לא מחזיק כסף: רשומה עם עלות כותבת
// הוצאה ומקושרת אליה (ראה כותרת הכסף ב-logEntries.ts). ספירה כפולה אינה משהו
// שהמוצר נמנע ממנו, היא משהו שאין לו דרך לבטא.
//
// This is the only file that summed the two vanished lines, so removing them here
// is what makes the guarantee structural rather than a rule someone must remember.

export type FarmProfitForecast = {
  expectedIncome: number;
  // צריכה בפועל על חלקות, והדבר היחיד שיורד מההכנסה.
  plotExpenses: number;
  profit: number;
  // האם נרשמה בכלל הוצאת חלקה אחת. אותה הבחנה בדיוק שקיימת
  // ב-PlotProfitForecast: "לא נרשמו הוצאות" הוא חוסר ידיעה, "אפס
  // הוצאות" הוא עובדה, ורק הראשון מצדיק את חיווי ה-Wheat.
  //
  // **נמדד על הוצאות חלקה ולא על כל הוצאה במשק.** חקלאי שרשם רק קניות
  // משק לא הזין שום דבר שנכנס למספר הזה, ולהגיד לו שההוצאות במעקב היה
  // מבטיח שהמספר מלא כשהוא ריק.
  plotExpensesTracked: boolean;
  // כל מה שאינו צריכה על חלקה: קניית מלאי, ארנונה, ביטוח, משכורת.
  // **מוצג בלבד, ואינו נכנס ל-profit ולא לאף כרטיס חלקה.**
  farmExpenses: number;
  plotsWithForecast: number;
  plotsWithoutForecast: number;
};

export type PlotProfitRow = PlotWithCropCycle & {
  // Every shekel allocated to this plot, and now genuinely every one: a spray's
  // material and the hours it took arrive here as expenses like anything else.
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
  farmExpenses: number,
  plotExpensesTracked: boolean,
): FarmProfitForecast {
  let expectedIncome = 0;
  // **מתחיל באפס ולא ב-farmExpenses.** זו השורה היחידה שמבדילה בין
  // הכלל הזה לקודמו, ולכן היא גם השורה שתספר אם מישהו החזיר אותו.
  let plotExpenses = 0;
  let plotsWithForecast = 0;
  let plotsWithoutForecast = 0;

  for (const plot of plots) {
    plotExpenses += plot.expenses;
    if (plot.expectedIncome == null) {
      plotsWithoutForecast += 1;
      continue;
    }
    plotsWithForecast += 1;
    expectedIncome += plot.expectedIncome;
  }

  return {
    expectedIncome,
    plotExpenses,
    profit: expectedIncome - plotExpenses,
    plotExpensesTracked,
    farmExpenses,
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
  const expensesState = useExpenses(supabase, plotId ?? undefined);

  const { expenses, loading, failed, loadCount, refresh } = expensesState;

  // **The plot's whole cost, out of one query.** It used to be three -- expenses,
  // plus the spray costs and the work costs frozen on the journal rows -- and the
  // sum of the three was where the same material could be counted twice. Since
  // 2026-09-10 a journal entry with a cost writes an expense, so this list is
  // already everything the plot cost.
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
    let farmExpenses = 0;
    let plotExpenseCount = 0;
    for (const expense of expenses) {
      if (expense.plotId) {
        plotExpenseCount += 1;
        expensesByPlot.set(
          expense.plotId,
          (expensesByPlot.get(expense.plotId) ?? 0) + expense.amount,
        );
      } else {
        farmExpenses += expense.amount;
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
      // עוברות הלאה כדי שהתצוגה תוכל להציג אותן, ולא כדי שייכנסו לרווח.
      farmExpenses,
      // ספירת הוצאות החלקה ולא `expenses.length`: משק שרשם רק קניות משק
      // עדיין לא הזין כלום שנכנס למספר.
      plotExpenseCount > 0,
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
