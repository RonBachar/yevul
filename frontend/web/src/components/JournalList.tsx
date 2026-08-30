import { useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { t, useLogEntries, type LogEntry } from '@yevul/shared';
import { LogRow } from './LogRow';
import { LogEntrySheet } from './LogEntrySheet';
import './JournalList.css';

// היומן בווב, design.md "Journal List". רכיב תוכן, לא מסך, מרונדר גם
// ביומן הכללי (כל המשק) וגם בטאב יומן בפרטי חלקה (חלקה אחת). רשימה
// שטוחה מהחדש לישן, בלי כותרות קבוצה, כל שורה נושאת את התאריך שלה.
// renderHeader מקבל את המצב **שכבר נטען כאן** ומרנדר מעליו, מאותו
// נימוק בדיוק כמו ב-ExpenseList: מסך היומן תולה עליו סרגל ייצוא בלי
// לקרוא ל-useLogEntries בעצמו ולשכפל את השאילתה.
export function JournalList({
  supabase,
  plotId,
  showPlotName,
  renderHeader,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
  renderHeader?: (state: {
    entries: LogEntry[];
    plotNames: Map<string, string>;
    loading: boolean;
  }) => ReactNode;
}) {
  const entriesState = useLogEntries(supabase, plotId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);

  function openCreate() {
    setEditingEntry(null);
    setSheetOpen(true);
  }

  function openEdit(entry: LogEntry) {
    setEditingEntry(entry);
    setSheetOpen(true);
  }

  return (
    <div className="journal-list">
      {renderHeader?.({
        entries: entriesState.entries,
        plotNames: entriesState.plotNames,
        loading: entriesState.loading,
      })}
      <button type="button" className="form__submit journal-list__new" onClick={openCreate}>
        {t('log.new')}
      </button>

      {entriesState.loading && <p className="screen__note">{t('common.loading')}</p>}
      {!entriesState.loading && entriesState.failed && (
        <p className="form__message form__message--bad" role="alert">
          {t('log.loadError')}
        </p>
      )}
      {!entriesState.loading && !entriesState.failed && entriesState.entries.length === 0 && (
        <p className="screen__note">{t('log.empty')}</p>
      )}

      {!entriesState.loading && !entriesState.failed && entriesState.entries.length > 0 && (
        <div className="journal-list__rows">
          {entriesState.entries.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              plotName={
                showPlotName ? (entriesState.plotNames.get(entry.plotId ?? '') ?? null) : null
              }
              onEdit={() => openEdit(entry)}
            />
          ))}
        </div>
      )}

      <LogEntrySheet
        supabase={supabase}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entry={editingEntry}
        defaultPlotId={plotId ?? null}
        farmId={entriesState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          entriesState.refresh();
        }}
      />
    </div>
  );
}
