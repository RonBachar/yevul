import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t, useLogEntries, usePlots } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { LogRow } from '../components/LogRow';
import { LogEntrySheet } from '../components/LogEntrySheet';
import './SprayLogScreen.css';

// מסך יומן ריסוס נפרד, design.md "Spray Log Screen". מוצג רק ריסוסים,
// מסונן לפי חלקה, prd.md סעיף 8: "מה שהחקלאי חייב להציג לרגולטור...
// הוא הדבר הכי חשוב שיש לו באפליקציה, והוא צריך למצוא אותו בלי לחפש".
// כפתור "ייצוא לרגולטור" לא נבנה כאן במכוון, ראה docs/roadmap.md.
//
// plotId מגיע כפרמטר שאילתה אופציונלי (?plot=...) כשמגיעים מכפתור
// בפרטי חלקה, כדי שהמסך ייפתח כבר מסונן לאותה חלקה בלי לאבד את
// יתרון הכתובת האמיתית של הווב (אפשר לסמן ולשתף).
export function SprayLogScreen() {
  const [searchParams] = useSearchParams();
  const routePlotId = searchParams.get('plot');

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
