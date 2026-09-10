import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  deleteLogEntry,
  formatAmount,
  formatNumber,
  t,
  useFarmSettings,
  useLogEntries,
  usePlots,
  workLogTotals,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { LogRow } from '../components/LogRow';
import { LogEntrySheet } from '../components/LogEntrySheet';
import './WorkLogScreen.css';

// יומן שעות העבודה. עידו, 6.9.2026: "אני לא רואה בכלל יומן שעות עבודה".
// הוא צדק, לא היה כזה.
//
// **מסך משלו שמגיעים אליו מהיומן, ולא יעד נוסף בסרגל הצד.** בדיוק
// הדפוס של יומן הריסוס (design.md, Journal List: הגלולה "מקשרת החוצה
// למסך ייעודי במקום לסנן במקום"), ומאותה סיבה: הניווט הראשי מחזיק
// חמישה יעדים ושישי היה מדלל אותם, בעוד שהיומן הוא בדיוק המקום שבו
// חקלאי מחפש את מה שהוא רשם.
//
// המסך מציג רק רישומים שנושאים שעות, מכל סוג שהוא. זו לא הגבלה על סוג
// הרישום: השעות פתוחות בכל רישום ביומן, והמסך הזה הוא התצוגה שלהן.
//
// שתי הסכימות מעל הרשימה הן השאלה שעידו באמת שאל, "כמה זה עולה לי":
// כמה שעות, וכמה כסף. שתיהן נסכמות ב-workLogTotals, שנבדק, כדי שהמסך
// רק ידפיס אותן.
//
// plotId מגיע כפרמטר שאילתה אופציונלי (?plot=...) כמו ביומן הריסוס,
// כדי שקישור למסך יוכל להגיע כבר מסונן.
export function WorkLogScreen() {
  const [searchParams] = useSearchParams();
  const routePlotId = searchParams.get('plot');

  const plotsState = usePlots(supabase);
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(routePlotId);
  // הסינון נעשה במסד ולא בקליינט: השאילתה מבקשת רק שורות עם שעות.
  const entriesState = useLogEntries(supabase, selectedPlotId ?? undefined, undefined, true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const editingEntry = entriesState.entries.find((entry) => entry.id === editingEntryId) ?? null;

  const totals = useMemo(() => workLogTotals(entriesState.entries), [entriesState.entries]);

  // ניקוי המזהה הוא מה שהופך את זה ליצירה. אותה מלכודת בדיוק שמתועדת
  // ב-SprayLogScreen: המזהה שורד את סגירת הגיליון, ובלי האיפוס לחיצה
  // על הכפתור הייתה מחזירה לעריכה את השורה האחרונה שנערכה.
  function openCreate() {
    setEditingEntryId(null);
    setSheetOpen(true);
  }

  function openEdit(entryId: string) {
    setEditingEntryId(entryId);
    setSheetOpen(true);
  }

  // totals is derived from entriesState.entries via useMemo above, so the
  // refresh below is what makes the two summary lines drop the deleted
  // entry's hours and cost -- no separate money query to refresh here, unlike
  // PlotDetailScreen's profit header.
  async function handleDelete(entryId: string) {
    await deleteLogEntry(supabase, entryId);
    entriesState.refresh();
  }

  return (
    <div className="screen">
      <div className="work-log__header">
        <h1 className="screen__title">{t('workLog.title')}</h1>
        <p className="screen__note">
          {entriesState.entries.length} {t('workLog.countSuffix')}
        </p>
      </div>

      {/* שתי הסכימות. מוצגות גם כשהן אפס, כדי שהמסך לא יזוז ברגע
          שנרשמת השורה הראשונה, ומוסתרות בזמן טעינה כדי שלא תוצג
          הצהרה כספית שקרית לרגע (אותו באג שתועד ב-usePlotExpensesTotal). */}
      {!entriesState.loading && !entriesState.failed && (
        <div className="work-log__totals">
          <div className="work-log__total">
            <span className="work-log__total-label">{t('workLog.totalHours')}</span>
            <span className="work-log__total-value">
              {formatNumber(totals.hours)} {t('work.hoursSuffix')}
            </span>
          </div>
          <div className="work-log__total">
            <span className="work-log__total-label">{t('workLog.totalCost')}</span>
            <span className="work-log__total-value">{formatAmount(totals.cost, currency)}</span>
          </div>
        </div>
      )}

      <div className="work-log__filters" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={selectedPlotId === null}
          className={
            selectedPlotId === null
              ? 'work-log__filter work-log__filter--active'
              : 'work-log__filter'
          }
          onClick={() => setSelectedPlotId(null)}
        >
          {t('workLog.allPlots')}
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
                  ? 'work-log__filter work-log__filter--active'
                  : 'work-log__filter'
              }
              onClick={() => setSelectedPlotId(plot.id)}
            >
              {plot.name}
            </button>
          ))}
      </div>

      {/* מחוץ לכל תנאי טעינה/שגיאה/ריקנות, בדיוק כמו ביומן הריסוס:
          המצב הריק הוא בדיוק המצב שזקוק לכפתור הזה. */}
      <button type="button" className="form__submit work-log__new" onClick={openCreate}>
        {t('workLog.new')}
      </button>

      {entriesState.loading && <p className="screen__note">{t('common.loading')}</p>}
      {!entriesState.loading && entriesState.failed && (
        <p className="form__message form__message--bad" role="alert">
          {t('workLog.loadError')}
        </p>
      )}
      {!entriesState.loading && !entriesState.failed && entriesState.entries.length === 0 && (
        <p className="screen__note">{t('workLog.empty')}</p>
      )}

      {!entriesState.loading && !entriesState.failed && entriesState.entries.length > 0 && (
        <div className="work-log__rows">
          {entriesState.entries.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              plotName={
                selectedPlotId === null
                  ? (entriesState.plotNames.get(entry.plotId ?? '') ?? null)
                  : null
              }
              workDetailed
              onEdit={() => openEdit(entry.id)}
              onDeleteCommit={() => handleDelete(entry.id)}
            />
          ))}
        </div>
      )}

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
