import { logEntryTypeLabelKey, safeHarvestDate, t, type LogEntry } from '@yevul/shared';
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
export function LogRow({
  entry,
  plotName,
  onEdit,
  sprayDetailed = false,
}: {
  entry: LogEntry;
  plotName: string | null;
  onEdit: () => void;
  sprayDetailed?: boolean;
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

  const metaParts = [plotName, detail].filter((part): part is string => Boolean(part));

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
          <span className={sprayDetailed ? 'log-row__meta log-row__meta--wrap' : 'log-row__meta'}>
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
