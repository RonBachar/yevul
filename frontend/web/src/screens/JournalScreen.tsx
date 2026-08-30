import { Link } from 'react-router-dom';
import { SprayCan } from 'lucide-react';
import { journalCsv, t, useCurrentFarm, useLogEntries } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { JournalList } from '../components/JournalList';
import { ExportBar } from '../components/ExportBar';
import './JournalScreen.css';

// היומן הכללי, design.md "Journal List". כל רשומות המשק, בלי סינון
// לפי חלקה. סינון עונה לא נבנה כאן במכוון, שייך לליטוש עתידי.
//
// ייצוא היומן המלא נוסף בשלב 4, prd.md סעיף 8: "בנוסף לכפתור הייצוא
// שבמסך הזה, יש בתוך היומן המלא גם כפתור ייצוא של היומן כולו".
export function JournalScreen() {
  const { farm } = useCurrentFarm(supabase);
  const { entries, plotNames } = useLogEntries(supabase);

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

      <ExportBar
        farmName={farm?.name ?? null}
        actions={[
          {
            label: t('report.exportJournal'),
            build: () => journalCsv(entries, plotNames, 'journal'),
          },
        ]}
      />

      <JournalList supabase={supabase} showPlotName />
    </div>
  );
}
