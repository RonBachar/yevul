import {
  expensesCsv,
  profitabilityCsv,
  t,
  useCurrentFarm,
  useExpenses,
  useFarmProfit,
  useFarmSettings,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { ExpenseList } from '../components/ExpenseList';
import { ExportBar } from '../components/ExportBar';

// טאב הכסף, מאחד את מה שהיה הנהלת חשבונות ודוחות, design.md: "Merges
// what used to be separate Ledger and Reports destinations". שלב 3
// בנה כאן את רשימת ההוצאות, ושלב 4 מוסיף את הייצוא.
//
// שני הדוחות כאן הם אלה ש-prd.md סעיף 10 מייעד לחקלאי ולרואה החשבון.
// **הדוח השנתי המלא לא נבנה**, כי הוא דורש פילוח לפי קטגוריה, ואין
// קטגוריות במוצר (עידו דחה את הבורר בשלב 3), וגם תיקיית קבלות שדורשת
// אריזת ZIP. ראה את הנימוק המלא ב-packages/shared/src/reports.ts.
//
// הנתונים נטענים כאן ולא בתוך ExportBar, כי הוא רכיב תצוגה שמקבל
// בונים מוכנים, ואותם הוקים כבר משרתים את המסך ממילא.
export function MoneyScreen() {
  const { farm } = useCurrentFarm(supabase);
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';
  const { plots } = useFarmProfit(supabase);
  const { expenses, plotNames } = useExpenses(supabase);

  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.money')}</h1>

      <ExportBar
        farmName={farm?.name ?? null}
        actions={[
          {
            label: t('report.exportProfitability'),
            build: () => profitabilityCsv(plots, currency),
          },
          {
            label: t('report.exportExpenses'),
            build: () => expensesCsv(expenses, plotNames, currency),
          },
        ]}
      />

      <ExpenseList supabase={supabase} showPlotName />
    </div>
  );
}
