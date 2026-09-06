import { Link } from 'react-router-dom';
import { Clock, SprayCan } from 'lucide-react';
import { journalCsv, t, useCurrentFarm, useMyRole, workerModeShell } from '@yevul/shared';
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
  const role = useMyRole(supabase);
  const shell = workerModeShell(role.role, role.loading);

  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.journal')}</h1>

      {/* שתי גלולות שמקשרות החוצה, design.md, Journal List: "a יומן
          ריסוס pill... links out to the dedicated Spray Log screen
          rather than just filtering in place". יומן שעות העבודה מגיע
          לכאן באותה דרך בדיוק, ומאותה סיבה: עידו לא מצא אותו, והיומן
          הוא המקום שבו חקלאי מחפש את מה שרשם. **בלי יעד שישי בסרגל
          הצד**, שהיה מדלל את חמשת היעדים הקיימים.

          גלולת השעות מוצגת רק למי שרואה כסף. המסך עצמו מסכם עלויות
          וחסום מאחורי אותו שומר תפקיד ב-App.tsx, וקישור שמנתב מחדש
          לבית הוא קישור שבור. */}
      <div className="journal__links">
        <Link className="journal__spray-log-link" to="/spray-log">
          <SprayCan size={20} strokeWidth={2} aria-hidden="true" />
          <span>{t('sprayLog.title')}</span>
        </Link>
        {shell.showMoney && (
          <Link className="journal__spray-log-link" to="/work-log">
            <Clock size={20} strokeWidth={2} aria-hidden="true" />
            <span>{t('workLog.title')}</span>
          </Link>
        )}
      </div>

      <JournalList
        supabase={supabase}
        showPlotName
        renderAside={({ entries, plotNames, loading }) => (
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
