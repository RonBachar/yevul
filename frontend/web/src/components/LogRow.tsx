import { logEntryTypeLabelKey, safeHarvestDate, t, type LogEntry } from '@yevul/shared';
// entry.cost is labelled with the generic 'log.form.cost' ("עלות") on this row's
// work-hours detail line, not 'work.cost' ("עלות העבודה" / "labour cost") --
// since 2026-09-10 this figure is the entry's whole cost, material included, and
// the generic label is the honest one. See workEntry.ts and logEntries.ts.
import './LogRow.css';

// אטום היומן בווב, מקביל ל-Log Row של design.md. בניגוד ל-Task Row,
// בלי שום כפתור פעולה: רשומת יומן היא תיעוד של משהו שכבר קרה, אין מה
// להשלים או למחוק כאן. לחיצה על השורה פותחת את אותו Log Entry Sheet
// לעריכה.
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
export function LogRow({
  entry,
  plotName,
  onEdit,
  sprayDetailed = false,
  workDetailed = false,
}: {
  entry: LogEntry;
  plotName: string | null;
  onEdit: () => void;
  sprayDetailed?: boolean;
  workDetailed?: boolean;
}) {
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
        {/* המודיפייר תלוי ב-sprayDetailed ולא במסך שמרנדר. הוא זה
            שמוסיף את ימי ההמתנה למחרוזת כמה שורות מעל, ולכן הוא גם
            התנאי המדויק שבו השורה מתארכת ואסור לה להיחתך. */}
        {metaParts.length > 0 && (
          <span
            className={
              sprayDetailed || workDetailed ? 'log-row__meta log-row__meta--wrap' : 'log-row__meta'
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
  );
}
