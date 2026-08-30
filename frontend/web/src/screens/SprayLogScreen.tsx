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
