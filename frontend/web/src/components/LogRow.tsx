import { logEntryTypeLabelKey, t, type LogEntry } from '@yevul/shared';
import './LogRow.css';

// אטום היומן בווב, מקביל ל-Log Row של design.md. בניגוד ל-Task Row,
// בלי שום כפתור פעולה: רשומת יומן היא תיעוד של משהו שכבר קרה, אין מה
// להשלים או למחוק כאן. לחיצה על השורה פותחת את אותו Log Entry Sheet
// לעריכה.
export function LogRow({
  entry,
  plotName,
  onEdit,
}: {
  entry: LogEntry;
  plotName: string | null;
  onEdit: () => void;
}) {
  const tag =
    entry.type === 'spray'
      ? { className: 'log-row__tag--spray', label: t(logEntryTypeLabelKey('spray')) }
      : entry.type === 'harvest'
        ? { className: 'log-row__tag--harvest', label: t(logEntryTypeLabelKey('harvest')) }
        : null;

  const detail =
    entry.type === 'spray'
      ? [entry.sprayPest, entry.sprayMaterial].filter(Boolean).join(' · ')
      : entry.type === 'harvest'
        ? [entry.harvestQty, entry.harvestUnit].filter(Boolean).join(' ')
        : entry.source === 'voice'
          ? t('log.row.sourceVoice')
          : entry.source === 'task'
            ? t('log.row.sourceTask')
            : (entry.note ?? '');

  const metaParts = [plotName, detail].filter((part): part is string => Boolean(part));

  return (
    <button type="button" className="log-row" onClick={onEdit}>
      <span className="log-row__date">
        {new Date(entry.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
      </span>
      <span className="log-row__body">
        <span className="log-row__title-row">
          <span className="log-row__title">{t(logEntryTypeLabelKey(entry.type))}</span>
          {tag && <span className={`log-row__tag ${tag.className}`}>{tag.label}</span>}
        </span>
        {metaParts.length > 0 && <span className="log-row__meta">{metaParts.join(' · ')}</span>}
      </span>
    </button>
  );
}
