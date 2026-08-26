import { Link } from 'react-router-dom';
import { SprayCan } from 'lucide-react';
import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { JournalList } from '../components/JournalList';
import './JournalScreen.css';

// היומן הכללי, design.md "Journal List". כל רשומות המשק, בלי סינון
// לפי חלקה. סינון עונה לא נבנה כאן במכוון, שייך לליטוש עתידי.
export function JournalScreen() {
  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.journal')}</h1>

      {/* פס קבוע שמקשר החוצה למסך יומן הריסוס, design.md, Journal List:
          "a יומן ריסוס pill... links out to the dedicated Spray Log
          screen rather than just filtering in place". */}
      <Link className="journal__spray-log-link" to="/spray-log">
        <SprayCan size={20} strokeWidth={2} aria-hidden="true" />
        <span>{t('sprayLog.title')}</span>
      </Link>

      <JournalList supabase={supabase} showPlotName />
    </div>
  );
}
