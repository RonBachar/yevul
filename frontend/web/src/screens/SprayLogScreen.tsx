import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { journalCsv, t, useCurrentFarm, useLogEntries, usePlots } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { LogRow } from '../components/LogRow';
import { LogEntrySheet } from '../components/LogEntrySheet';
import { ExportBar } from '../components/ExportBar';
import './SprayLogScreen.css';

// מסך יומן ריסוס נפרד, design.md "Spray Log Screen". מוצג רק ריסוסים,
// מסונן לפי חלקה, prd.md סעיף 8: "מה שהחקלאי חייב להציג לרגולטור...
// הוא הדבר הכי חשוב שיש לו באפליקציה, והוא צריך למצוא אותו בלי לחפש".
// כפתור "ייצוא לרגולטור" נבנה בשלב 4, design.md, Spray Log Screen:
// "A single full-width pill at the bottom reads ייצוא לרגולטור".
// הוא מייצא **את מה שמסונן על המסך**, כלומר מכבד את בורר החלקה
// שמעליו, כי מפקח מבקש בדרך כלל חלקה אחת ולא את כל המשק. הקובץ נושא
// את שדה "בטוח לקטיף" הנגזר, שהוא מה שהמפקח באמת בודק.
//
// plotId מגיע כפרמטר שאילתה אופציונלי (?plot=...) כשמגיעים מכפתור
// בפרטי חלקה, כדי שהמסך ייפתח כבר מסונן לאותה חלקה בלי לאבד את
// יתרון הכתובת האמיתית של הווב (אפשר לסמן ולשתף).
export function SprayLogScreen() {
  const [searchParams] = useSearchParams();
  const routePlotId = searchParams.get('plot');

  const { farm } = useCurrentFarm(supabase);
  const plotsState = usePlots(supabase);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(routePlotId);
  const entriesState = useLogEntries(supabase, selectedPlotId ?? undefined, 'spray');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const editingEntry = entriesState.entries.find((entry) => entry.id === editingEntryId) ?? null;

  return (
    <div className="screen">
      <div className="spray-log__header">
        <h1 className="screen__title">{t('sprayLog.title')}</h1>
        <p className="screen__note">
          {entriesState.entries.length} {t('sprayLog.countSuffix')}
        </p>
      </div>

      {/* פריסת מסילה מ-1024 ומעלה, אותו דפוס כמו מסך הכסף. ראה
          .layout-rail ב-shell.css. נמדד בפועל על 1536 לפני השינוי:
          הרשימה, הבורר וסרגל הייצוא כולם 1144, כלומר הסרגל תפס שורה
          שלמה ברוחב מלא ודחף את הרשימה למטה בלי שאף אחד מהם הרוויח
          מהרוחב הזה. אחרי: רשימה 792 ומסילה 320, אותם מספרים בדיוק
          כמו מסך הכסף.

          **בורר החלקות נשאר כאן, בעמודה הראשית מעל הרשימה, ולא במסילה.**
          .layout-rail הוא גריד של שני ילדים, ומתחת ל-1024 הוא קורס
          לעמודה אחת לפי סדר ה-DOM. אילו הבורר היה יושב במסילה, בנייד
          הוא היה נוחת מתחת לרשימה, וזה שינוי התנהגות שהמשתמש רואה ולא
          רק פריסה. כך הסדר בנייד נשאר בדיוק כמו היום: כותרת, בורר,
          רשימה, ייצוא.

          מה שכן השתנה בנייד, ובמכוון: ל-.layout-rail יש gap של 32 שחל
          גם כשהוא עמודה אחת, ולכן נוספו 32 פיקסל בין סוף הרשימה
          לסרגל הייצוא. עד כאן הם היו צמודים, כי לרשימה אין
          margin-bottom ולסרגל אין margin-top. זה מיישר את המסך הזה
          עם הכסף והיומן, שכבר נראים כך מאז 3d402ed. */}
      <div className="layout-rail">
        <div className="spray-log__main">
          <div className="spray-log__filters" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={selectedPlotId === null}
              className={
                selectedPlotId === null
                  ? 'spray-log__filter spray-log__filter--active'
                  : 'spray-log__filter'
              }
              onClick={() => setSelectedPlotId(null)}
            >
              {t('sprayLog.allPlots')}
            </button>
            {!plotsState.loading &&
              plotsState.plots.map((plot) => (
                <button
                  key={plot.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedPlotId === plot.id}
                  className={
                    selectedPlotId === plot.id
                      ? 'spray-log__filter spray-log__filter--active'
                      : 'spray-log__filter'
                  }
                  onClick={() => setSelectedPlotId(plot.id)}
                >
                  {plot.name}
                </button>
              ))}
          </div>

          {entriesState.loading && <p className="screen__note">{t('common.loading')}</p>}
          {!entriesState.loading && entriesState.failed && (
            <p className="form__message form__message--bad" role="alert">
              {t('sprayLog.loadError')}
            </p>
          )}
          {!entriesState.loading && !entriesState.failed && entriesState.entries.length === 0 && (
            <p className="screen__note">{t('sprayLog.empty')}</p>
          )}

          {!entriesState.loading && !entriesState.failed && entriesState.entries.length > 0 && (
            <div className="spray-log__rows">
              {entriesState.entries.map((entry) => (
                <LogRow
                  key={entry.id}
                  entry={entry}
                  plotName={
                    selectedPlotId === null
                      ? (entriesState.plotNames.get(entry.plotId ?? '') ?? null)
                      : null
                  }
                  sprayDetailed
                  onEdit={() => {
                    setEditingEntryId(entry.id);
                    setSheetOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* המסילה נשארת גם כשהרשימה ריקה, במכוון. הייצוא לרגולטור הוא
            הסיבה שהמסך הזה קיים בנפרד, הוא זמין תמיד, והוא לא תוכן
            שנגזר מהרשימה. אילו היה קורס על חלקה ריקה, הבורר היה מזיז
            את כל הפריסה בכל לחיצה על חלקה. נמדד על 1536 עם חלקה בלי
            ריסוסים: המסילה 177 גובה מול 95 של העמודה הראשית, כלומר
            הצד ה"ריק" הוא דווקא הראשי, והמסילה מחזיקה כרטיס אמיתי. */}
        <aside className="layout-rail__aside">
          <ExportBar
            farmName={farm?.name ?? null}
            loading={entriesState.loading}
            actions={[
              {
                label: t('report.exportSprayLog'),
                build: () => journalCsv(entriesState.entries, entriesState.plotNames, 'spray-log'),
              },
            ]}
          />
        </aside>
      </div>

      <LogEntrySheet
        supabase={supabase}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entry={editingEntry}
        defaultPlotId={selectedPlotId}
        farmId={entriesState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          entriesState.refresh();
        }}
      />
    </div>
  );
}
