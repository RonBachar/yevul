import { Link } from 'react-router-dom';
import { SprayCan } from 'lucide-react';
import { journalCsv, t, useCurrentFarm } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { JournalList } from '../components/JournalList';
import { ExportBar } from '../components/ExportBar';
import './JournalScreen.css';

// היומן הכללי, design.md "Journal List". כל רשומות המשק, בלי סינון
// לפי חלקה. סינון עונה לא נבנה כאן במכוון, שייך לליטוש עתידי.
//
// ייצוא היומן המלא נוסף בשלב 4, prd.md סעיף 8: "בנוסף לכפתור הייצוא
// שבמסך הזה, יש בתוך היומן המלא גם כפתור ייצוא של היומן כולו".
// הסרגל נתלה על הנתונים של JournalList דרך renderHeader ולא טוען
// אותם בעצמו, אחרת אותה שאילתת יומן הייתה רצה פעמיים בכל טעינה.
export function JournalScreen() {
  const { farm } = useCurrentFarm(supabase);

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

      <JournalList
        supabase={supabase}
        showPlotName
        renderHeader={({ entries, plotNames, loading }) => (
          <ExportBar
            farmName={farm?.name ?? null}
            loading={loading}
            actions={[
              {
                label: t('report.exportJournal'),
                build: () => journalCsv(entries, plotNames, 'journal'),
              },
            ]}
          />
        )}
      />
    </div>
  );
}
