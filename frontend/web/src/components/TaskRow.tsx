import { useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import {
  formatAmount,
  t,
  taskDueDisplay,
  type Currency,
  type Task,
  type TaskAssignee,
} from '@yevul/shared';
import { ConfirmDialog } from './ConfirmDialog';
import './TaskRow.css';

const UNDO_MS = 5000;

// אטום התכונה בווב, מקביל ל-Task Row של design.md. שני כפתורי אייקון
// קטנים, ירוק "בוצע" ואדום "מחיקה" (לא snooze יותר, בקשת חקלאי
// מפורשת: לפעמים משימה כבר לא רלוונטית ואין טעם לרשום אותה כבוצעה, רק
// להסיר). שני מנגנוני בטיחות שונים במכוון: "בוצע" עם undo toast של חמש
// שניות (completed_at הוא אירוע חד-כיווני במסד, הכתיבה נדחית ולא
// מבוטלת אחרי שנשלחה), "מחיקה" עם דיאלוג אישור מודעי במקום, בקשת
// חקלאי מפורשת: מחיקה מרגישה סופית יותר מהשלמה.
export function TaskRow({
  task,
  plotName,
  currency,
  assignee = null,
  onEdit,
  onCompleteCommit,
  onDeleteCommit,
}: {
  task: Task;
  plotName: string | null;
  currency: Currency;
  // אווטאר החבר, שלב 6, design.md, Member Avatar. מגיע מוכן מ-TaskBoard
  // (הרוסטר נטען פעם אחת ללוח), ו-null כשהמשימה לא משויכת או משויכת
  // למשתמש המחובר, שאז לא מוצג כלום.
  assignee?: TaskAssignee | null;
  onEdit: () => void;
  onCompleteCommit: () => void;
  onDeleteCommit: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fireComplete() {
    setPending(true);
    timerRef.current = setTimeout(onCompleteCommit, UNDO_MS);
  }

  function undo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPending(false);
  }

  function confirmDelete() {
    setConfirmingDelete(false);
    onDeleteCommit();
  }

  if (pending) {
    return (
      <div className="task-row task-row--undo">
        <span className="task-row__undo-text">{t('tasks.completedToast')}</span>
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
      <button type="button" className="task-row__body" onClick={onEdit}>
        <span className="task-row__title">{task.title}</span>
        {metaParts.length > 0 && (
          <span className={overdue ? 'task-row__meta task-row__meta--overdue' : 'task-row__meta'}>
            {metaParts.join(' · ')}
          </span>
        )}
      </button>
      {/* אווטאר החבר, design.md, Member Avatar: עיגול 32px, מילוי
          Field-100, ראשי תיבות ב-Field-700, באזור ה-trailing בלבד. */}
      {assignee && (
        <span
          className="task-row__avatar"
          aria-label={`${t('tasks.assignedTo')} ${assignee.label}`}
          title={assignee.label}
        >
          {assignee.initials}
        </span>
      )}
      <div className="task-row__actions">
        <button
          type="button"
          className="task-row__icon-button task-row__icon-button--complete"
          onClick={fireComplete}
          aria-label={t('tasks.action.complete')}
        >
          <Check size={18} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="task-row__icon-button task-row__icon-button--delete"
          onClick={() => setConfirmingDelete(true)}
          aria-label={t('tasks.action.delete')}
        >
          <Trash2 size={18} strokeWidth={2.5} />
        </button>
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        title={t('tasks.deleteConfirmTitle')}
        message={task.title}
        confirmLabel={t('tasks.action.delete')}
        cancelLabel={t('tasks.action.undo')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
