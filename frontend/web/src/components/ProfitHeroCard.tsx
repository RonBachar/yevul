import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  formatAmount,
  formatSignedAmount,
  profitTone,
  t,
  useCurrentFarm,
  useFarmProfit,
  useFarmSettings,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import './ProfitHeroCard.css';

// Live P&L Hero Card, שלב 4, design.md. תאום הווב של
// frontend/mobile/src/components/ProfitHeroCard.tsx, אותה לוגיקה בדיוק
// מ-useFarmProfit ב-packages/shared, רק שכבת תצוגה אחרת.
//
// המילה "צפי" בתווית אינה קישוט: המספר הוא הכנסה משוערת שהחקלאי הקליד
// פחות הוצאות אמיתיות, ו-design.md מנמק למה אסור שייקרא כרווח שכבר קרה.
//
// **אינו מרונדר לעובד, בלי בדיקת תפקיד בקליינט**, כי שדות התחזית
// ממוסכים ל-null במסד ואז renderable יוצא false. משק חדש בלי חלקות הוא
// מצב אחר, ושם design.md דורש להציג ₪0 ב-Ink-900.
export function ProfitHeroCard() {
  const { loading, failed, forecast, renderable } = useFarmProfit(supabase);
  const { farm } = useCurrentFarm(supabase);
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';

  const profit = forecast.profit;
  const previous = useRef(profit);
  const [pulsing, setPulsing] = useState(false);

  // "On update, the number does a brief (200ms) scale-pulse", design.md.
  // רץ רק כשהערך באמת השתנה ולא בטעינה הראשונה, אחרת הוא מאשר שינוי
  // שלא קרה. prefers-reduced-motion מכבה אותו ב-CSS.
  useEffect(() => {
    if (previous.current === profit) return;
    previous.current = profit;
    setPulsing(true);
    const timer = setTimeout(() => setPulsing(false), 200);
    return () => clearTimeout(timer);
  }, [profit]);

  if (loading || failed || !renderable) return null;

  const tone = profitTone(profit);
  const Glyph = tone === 'loss' ? TrendingDown : TrendingUp;
  const isEmptyFarm = forecast.plotsWithForecast === 0;

  return (
    <section className="profit-hero">
      <p className="profit-hero__label">
        {farm?.name ? `${farm.name} · ${t('home.profit.forecast')}` : t('home.profit.forecast')}
      </p>

      <p
        className={`profit-hero__value profit-hero__value--${tone}${
          pulsing ? ' profit-hero__value--pulse' : ''
        }`}
      >
        {tone !== 'zero' && (
          <Glyph className="profit-hero__glyph" size={40} strokeWidth={2.5} aria-hidden="true" />
        )}
        {formatSignedAmount(profit, currency)}
      </p>

      {/* משק חדש בלי חלקות: ₪0 לבדו. פירוט של אפס מול אפס והסתייגויות
          על נתונים חסרים הם רעש בפעם הראשונה שחקלאי פותח את האפליקציה. */}
      {!isEmptyFarm && (
        <>
          <p className="profit-hero__breakdown">
            {t('plots.profit.income')} {formatAmount(forecast.expectedIncome, currency)} ·{' '}
            {t('plots.profit.expenses')} {formatAmount(forecast.expenses, currency)}
          </p>

          {/* Wheat ולא Loss-600: "עוד לא מוצג לך הכל", לא "אתה מפסיד". */}
          {!forecast.expensesTracked && (
            <p className="profit-hero__caveat profit-hero__caveat--wheat">
              {t('plots.profit.noExpensesYet')}
            </p>
          )}
          {forecast.plotsWithoutForecast > 0 && (
            <p className="profit-hero__caveat profit-hero__caveat--wheat">
              {t('home.profit.someWithoutForecast')}
            </p>
          )}
          {/* בלי השורה הזו ההפרש בין המספר הגדול לסכום כרטיסי החלקות
              נראה כמו שגיאת חישוב. */}
          {forecast.generalExpenses > 0 && (
            <p className="profit-hero__caveat">{t('home.profit.includesGeneral')}</p>
          )}
        </>
      )}
    </section>
  );
}
