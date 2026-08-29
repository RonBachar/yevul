import { Link } from 'react-router-dom';
import { t, useFarmProfit, useFarmSettings } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { PlotCard } from '../components/PlotCard';
import '../styles/form.css';
import '../components/PlotCard.css';
import './PlotsScreen.css';

// רשימת החלקות, המשימה הראשונה של שלב 3. יצא לקובץ משלו כמו שהערה
// ב-WebScreens.tsx כבר צפתה, כי הוא הראשון מבין מסכי השלד שקיבל תוכן.
export function PlotsScreen() {
  // useFarmProfit ולא usePlots: הכרטיס מציג מספר רווח משלב 4, וההוק
  // הזה מחזיר את אותן חלקות בדיוק עם התחזית כבר מחושבת מולן.
  const { loading, failed, plots } = useFarmProfit(supabase);
  const settings = useFarmSettings(supabase);

  return (
    <div className="screen">
      <div className="plots-header">
        <h1 className="screen__title">{t('screen.plots')}</h1>
        <Link className="form__submit" to="/plots/new">
          {t('plots.new')}
        </Link>
      </div>

      {loading && <p className="screen__note">{t('common.loading')}</p>}

      {!loading && failed && (
        <p className="form__message form__message--bad" role="alert">
          {t('plots.loadError')}
        </p>
      )}

      {!loading && !failed && plots.length === 0 && (
        <p className="screen__note">{t('plots.empty')}</p>
      )}

      {!loading && !failed && plots.length > 0 && (
        <div className="plot-list">
          {plots.map((plot) => (
            <PlotCard key={plot.id} plot={plot} currency={settings.form?.currency ?? 'ILS'} />
          ))}
        </div>
      )}
    </div>
  );
}
