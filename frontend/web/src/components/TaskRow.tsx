import { useRef, useState } from 'react';
import { Clock4 } from 'lucide-react';
import { formatAmount, t, taskDueDisplay, type Currency, type Task } from '@yevul/shared';
import './TaskRow.css';

const UNDO_MS = 5000;

// אטום התכונה בווב, מקביל ל-Task Row של design.md. בלי מחוות swipe,
// אין להן מקבילה בעכבר/מקלדת, ולכן שתי הפעולות מקבלות כפתור גלוי
// במקום זאת: תיבת סימון משלימה ישירות, כפתור שעון דוחה שבוע. אותו
// מנגנון undo של חמש שניות עם דחיית כתיבה, ראה ההערה המקבילה ב-TaskRow
// של הנייד לגבי completed_at כאירוע חד-כיווני.
export function TaskRow({
  task,
  plotName,
  currency,
  onEdit,
  onCompleteCommit,
  onSnoozeCommit,
}: {
  task: Task;
  plotName: string | null;
  currency: Currency;
  onEdit: () => void;
  onCompleteCommit: () => void;
  onSnoozeCommit: () => void;
}) {
  const [pending, setPending] = useState<'complete' | 'snooze' | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fire(kind: 'complete' | 'snooze', commit: () => void) {
    setPending(kind);
    timerRef.current = setTimeout(commit, UNDO_MS);
  }

  function undo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPending(null);
  }

  if (pending) {
    return (
      <div className="task-row task-row--undo">
        <span className="task-row__undo-text">
          {pending === 'complete' ? t('tasks.completedToast') : t('tasks.snoozedToast')}
        </span>
        <button type="button" className="task-row__undo-action" onClick={undo}>
          {t('tasks.action.undo')}
        </button>
      </div>
    );
  }

  const due = task.dueDate ? taskDueDisplay(task.dueDate) : null;
  const overdue = due?.tone === 'overdue';
  const metaParts = [
    plotName,
    due?.text,
    task.estimatedCost != null ? formatAmount(task.estimatedCost, currency) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className={overdue ? 'task-row task-row--overdue' : 'task-row'}>
      <button
        type="button"
        className="task-row__checkbox"
        onClick={() => fire('complete', onCompleteCommit)}
        aria-label={t('tasks.action.complete')}
      />
      <button type="button" className="task-row__body" onClick={onEdit}>
        <span className="task-row__title">{task.title}</span>
        {metaParts.length > 0 && (
          <span className={overdue ? 'task-row__meta task-row__meta--overdue' : 'task-row__meta'}>
            {metaParts.join(' · ')}
          </span>
        )}
      </button>
      <button
        type="button"
        className="task-row__snooze"
        onClick={() => fire('snooze', onSnoozeCommit)}
        aria-label={t('tasks.action.snooze')}
      >
        <Clock4 size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
