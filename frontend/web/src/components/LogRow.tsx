import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { logEntryTypeLabelKey, safeHarvestDate, t, type LogEntry } from '@yevul/shared';
// entry.cost is labelled with the generic 'log.form.cost' ("עלות") on this row's
// work-hours detail line, not 'work.cost' ("עלות העבודה" / "labour cost") --
// since 2026-09-10 this figure is the entry's whole cost, material included, and
// the generic label is the honest one. See workEntry.ts and logEntries.ts.
import { ConfirmDialog } from './ConfirmDialog';
import './LogRow.css';

// אטום היומן בווב, מקביל ל-Log Row של design.md.
//
// sprayDetailed מיועד אך ורק למסך יומן הריסוס (design.md, Spray Log
// Screen: "each showing pest, material and PHI days on its detail
// line, and, where applicable, the derived 'בטוח לקטיף' line"). ביומן
// הכללי ובטאב יומן בפרטי חלקה השורה נשארת קומפקטית, אותו רכיב עם
// הרחבה מותנית ולא עותק שני.
// workDetailed is its sibling, for the work-hours screen: there the hours and
// what they cost ARE the record, so they go on the detail line. Everywhere else
// the row stays as it was, one component with a conditional expansion rather
// than a third copy.
//
// **The delete button, added 2026-09-10, sits exactly where ExpenseRow's and
// TaskRow's do**: same Trash2, same Loss-600 pill, confirmed through the same
// ConfirmDialog before the write. `deleteLogEntry` (packages/shared/src/
// logEntries.ts) already existed and had no caller in either client -- this is
// that wiring, not a new deletion rule. The row does not decide what gets
// deleted; it only tells the farmer, because deleting the entry also
// soft-deletes the expense it created (founder's rule, see the header of
// deleteLogEntry): the confirmation names that consequence, but only when
// `entry.cost` is not null, since an entry with no cost never wrote an expense.
export function LogRow({
  entry,
  plotName,
  onEdit,
  onDeleteCommit,
  sprayDetailed = false,
  workDetailed = false,
}: {
  entry: LogEntry;
  plotName: string | null;
  onEdit: () => void;
  onDeleteCommit: () => void;
  sprayDetailed?: boolean;
  workDetailed?: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const tag =
    entry.type === 'spray'
      ? { className: 'log-row__tag--spray', label: t(logEntryTypeLabelKey('spray')) }
      : entry.type === 'harvest'
        ? { className: 'log-row__tag--harvest', label: t(logEntryTypeLabelKey('harvest')) }
        : null;

  const detail =
    entry.type === 'spray'
      ? [
          entry.sprayPest,
          entry.sprayMaterial,
          sprayDetailed && entry.sprayPhiDays != null
            ? `${entry.sprayPhiDays} ${t('sprayLog.phiDaysSuffix')}`
            : null,
          // The entry's whole cost, on the detail line of the Spray Log Screen
          // only, so the farmer sees what each spray cost him. Since 2026-09-10
          // there is one cost per entry (material and hours together, off the
          // expense it created), not a spray-only figure -- see the money header
          // in logEntries.ts.
          sprayDetailed && entry.cost != null ? `${t('log.form.cost')}: ${entry.cost}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : entry.type === 'harvest'
        ? [entry.harvestQty, entry.harvestUnit].filter(Boolean).join(' ')
        : entry.source === 'voice'
          ? t('log.row.sourceVoice')
          : entry.source === 'task'
            ? t('log.row.sourceTask')
            : (entry.note ?? '');

  // The hours and the entry's whole cost, on the work-hours screen only.
  // Appended rather than replacing `detail`, because an entry there is still a
  // spray or a pruning and losing what it was would make the list unreadable.
  // **`entry.cost` here is the entry's whole cost, material included, and not a
  // labour-only figure** -- since 2026-09-10 there is no separate work_cost
  // column to read. See the money header in logEntries.ts and workLogTotals.
  const workDetail = workDetailed
    ? [
        entry.workHours != null ? `${entry.workHours} ${t('work.hoursSuffix')}` : null,
        entry.cost != null ? `${t('log.form.cost')}: ${entry.cost}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const metaParts = [plotName, detail, workDetail].filter((part): part is string => Boolean(part));

  const safeHarvest =
    sprayDetailed && entry.type === 'spray' && entry.sprayPhiDays != null
      ? safeHarvestDate(entry.date, entry.sprayPhiDays)
      : null;

  const entryTitle = t(logEntryTypeLabelKey(entry.type));
  const dateLabel = new Date(entry.date).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
  });
  // The consequence named, and named conditionally: an entry with no cost
  // never wrote an expense, and claiming it did would be a lie in the
  // confirmation the farmer is trusting before he presses the destructive
  // button. See deleteLogEntry's header for the deletion rule itself.
  const confirmMessage =
    entry.cost != null
      ? `${entryTitle} · ${dateLabel} · ${t('log.deleteConfirmExpenseNote')}`
      : `${entryTitle} · ${dateLabel}`;

  function confirmDelete() {
    setConfirmingDelete(false);
    onDeleteCommit();
  }

  return (
    <div className="log-row">
      <button type="button" className="log-row__body" onClick={onEdit}>
        <span className="log-row__date">{dateLabel}</span>
        <span className="log-row__content">
          <span className="log-row__title-row">
            <span className="log-row__title">{entryTitle}</span>
            {tag && <span className={`log-row__tag ${tag.className}`}>{tag.label}</span>}
          </span>
          {/* המודיפייר תלוי ב-sprayDetailed ולא במסך שמרנדר. הוא זה
              שמוסיף את ימי ההמתנה למחרוזת כמה שורות מעל, ולכן הוא גם
              התנאי המדויק שבו השורה מתארכת ואסור לה להיחתך. */}
          {metaParts.length > 0 && (
            <span
              className={
                sprayDetailed || workDetailed
                  ? 'log-row__meta log-row__meta--wrap'
                  : 'log-row__meta'
              }
            >
              {metaParts.join(' · ')}
            </span>
          )}
          {safeHarvest && (
            <span className="log-row__safe-harvest">
              {t('log.form.safeHarvestPrefix')}{' '}
              {new Date(safeHarvest).toLocaleDateString('he-IL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className="log-row__delete"
        onClick={() => setConfirmingDelete(true)}
        aria-label={t('expense.action.delete')}
      >
        <Trash2 size={18} strokeWidth={2.5} />
      </button>
      <ConfirmDialog
        open={confirmingDelete}
        title={t('log.deleteConfirmTitle')}
        message={confirmMessage}
        confirmLabel={t('expense.action.delete')}
        cancelLabel={t('expense.action.cancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
