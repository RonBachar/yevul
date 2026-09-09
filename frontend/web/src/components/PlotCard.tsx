import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  formatAmount,
  formatSignedAmount,
  plotSummaryLine,
  profitTone,
  t,
  type Currency,
  type PlotProfitRow,
} from '@yevul/shared';
import './PlotCard.css';

// כרטיס חלקה, design.md "Plot Card". מספר הרווח נוסף בשלב 4, עד אז
// הכרטיס הציג שטח, גידול ועונה בלבד, כי הוא דרש צבירת הכנסה מול הוצאה
// בפועל שלא הייתה קיימת. אותו תוכן בדיוק כמו בנייד.
//
// forecast הוא null כשאין לחלקה שטח, יבול או מחיר צפויים, וגם לעובד
// ששדות התחזית ממוסכים לו במסד. בשני המקרים הכרטיס חוזר להיות שם
// ושורת סיכום בלבד.
export function PlotCard({ plot, currency }: { plot: PlotProfitRow; currency: Currency }) {
  const forecast = plot.forecast;
  const tone = forecast ? profitTone(forecast.profit) : 'zero';
  const Glyph = tone === 'loss' ? TrendingDown : TrendingUp;

  return (
    <Link className="plot-card" to={`/plots/${plot.id}`}>
      <span className="plot-card__name">{plot.name}</span>
      <span className="plot-card__summary">{plotSummaryLine(plot, plot.cropCycle)}</span>

      {forecast && (
        <>
          {/* התווית חסרה כאן עד היום, ועידו נתקל בזה בפועל: הוא ראה
              "10,708.16-" על חלקה בהפסד ולא ידע אם זה הרווח או ההוצאה.
              מספר בלי מילה שאומרת מה הוא אינו מספר. אותה תווית בדיוק
              כמו בכותרת פרטי החלקה. */}
          <span className="plot-card__label">{t('plots.profit.forecast')}</span>
          <span className={`plot-card__value plot-card__value--${tone}`}>
            {tone !== 'zero' && (
              <Glyph className="plot-card__glyph" size={28} strokeWidth={2.5} aria-hidden="true" />
            )}
            {formatSignedAmount(forecast.profit, currency)}
          </span>
          <span className="plot-card__breakdown">
            {t('plots.profit.income')} {formatAmount(forecast.expectedIncome, currency)} ·{' '}
            {t('plots.profit.expenses')} {formatAmount(forecast.expenses, currency)}
          </span>
        </>
      )}
    </Link>
  );
}
