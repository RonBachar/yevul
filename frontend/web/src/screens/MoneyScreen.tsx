import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { ExpenseList } from '../components/ExpenseList';

// טאב הכסף, מאחד את מה שהיה הנהלת חשבונות ודוחות, design.md: "Merges
// what used to be separate Ledger and Reports destinations". שלב 3
// בונה כאן רק את רשימת ההוצאות (הקצאה יחידה, בלי פיצול/הוצאה קבועה/
// קבלה, ראה packages/shared/src/expenses.ts). קבלות וייצוא דוחות
// שייכים לשלב 4, לפי הרודמאפ.
export function MoneyScreen() {
  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.money')}</h1>
      <ExpenseList supabase={supabase} showPlotName />
    </div>
  );
}
