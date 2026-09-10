import { useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteLogEntry, t, useLogEntries, type LogEntry } from '@yevul/shared';
import { LogRow } from './LogRow';
import { LogEntrySheet } from './LogEntrySheet';
import './JournalList.css';

// היומן בווב, design.md "Journal List". רכיב תוכן, לא מסך, מרונדר גם
// ביומן הכללי (כל המשק) וגם בטאב יומן בפרטי חלקה (חלקה אחת). רשימה
// שטוחה מהחדש לישן, בלי כותרות קבוצה, כל שורה נושאת את התאריך שלה.
// renderAside מקבל את המצב **שכבר נטען כאן** ומרנדר מעליו, מאותו
// נימוק בדיוק כמו ב-ExpenseList: מסך היומן תולה עליו סרגל ייצוא בלי
// לקרוא ל-useLogEntries בעצמו ולשכפל את השאילתה.
//
// onDeleted, added 2026-09-10 alongside the delete button on LogRow: fires
// after a successful delete, in addition to this list's own refresh, so a
// host screen holding separate money state can catch up too. PlotDetailScreen
// is the one caller that needs it -- its profit header comes from
// usePlotExpensesTotal, a query this list knows nothing about, and deleting a
// journal entry with a cost also deletes the expense that header sums.
export function JournalList({
  supabase,
  plotId,
  showPlotName,
  renderAside,
  onDeleted,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
  renderAside?: (state: {
    entries: LogEntry[];
    plotNames: Map<string, string>;
    loading: boolean;
  }) => ReactNode;
  onDeleted?: () => void;
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

  async function handleDelete(entryId: string) {
    await deleteLogEntry(supabase, entryId);
    entriesState.refresh();
    onDeleted?.();
  }

  const list = (
    <div className="journal-list">
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
        defaultPlotId={plotId ?? null}
        farmId={entriesState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          entriesState.refresh();
        }}
      />
    </div>
  );

  // בלי aside אין מה לפרוס, והרשימה חוזרת כמו שהיא. עם aside, מ-1024
  // ומעלה הם יושבים זה לצד זה במקום זה מעל זה. ראה .layout-rail
  // ב-shell.css.
  if (!renderAside) return list;

  return (
    <div className="layout-rail">
      {list}
      <aside className="layout-rail__aside">
        {renderAside({
          entries: entriesState.entries,
          plotNames: entriesState.plotNames,
          loading: entriesState.loading,
        })}
      </aside>
    </div>
  );
}
