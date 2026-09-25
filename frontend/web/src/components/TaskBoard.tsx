import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  completeTask,
  deleteTask,
  membersByUserId,
  t,
  taskAssignee,
  joinPlotNames,
  useMembers,
  useTasks,
  type Task,
} from '@yevul/shared';
import { TaskRow } from './TaskRow';
import { TaskSheet } from './TaskSheet';
import './TaskBoard.css';

// לוח המשימות, design.md "Task Board". רכיב תוכן, לא מסך, מרונדר גם
// בבית (כל המשק) וגם בטאב משימות בפרטי חלקה (חלקה אחת בלבד), אותה
// שורה ואותה שאילתה מצומצמת. plotId קובע את ההבדל, showPlotName קובע
// אם שם החלקה חוזר על עצמו בכל שורה, מיותר כשכבר בתוך מסך אותה חלקה.
//
// **Completion Prompts נמחק ב-2026-09-25.** הלוח לא מושך יותר הגדרות
// ולא בודק תפקיד: "בוצע" משלים ונכנס ליומן, בלי גיליון ובלי שאלות.
export function TaskBoard({
  supabase,
  plotId,
  showPlotName,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
}) {
  const tasksState = useTasks(supabase, plotId);
  // הרוסטר נטען פעם אחת ללוח ומומר למיפוי, כדי ששורת המשימה תפתור את
  // assigned_to לראשי תיבות בלי שאילתה לכל שורה, design.md, Member Avatar.
  const membersState = useMembers(supabase);
  const byUserId = useMemo(() => membersByUserId(membersState.members), [membersState.members]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  function openCreate() {
    setEditingTask(null);
    setSheetOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setSheetOpen(true);
  }

  async function handleComplete(task: Task) {
    await completeTask(supabase, task);
    tasksState.refresh();
  }

  async function handleDelete(taskId: string) {
    await deleteTask(supabase, taskId);
    tasksState.refresh();
  }

  // **כבר ממוין, ולכן אין כאן מיון.** useTasks מבקש created_at יורד
  // מהמסד, והחדשה ביותר מגיעה ראשונה. מיון נוסף כאן היה עותק שני שיכול
  // להתפצל מהראשון.
  const tasks = tasksState.tasks;

  return (
    <div className="task-board">
      <button type="button" className="form__submit task-board__new" onClick={openCreate}>
        {t('tasks.new')}
      </button>

      {tasksState.loading && <p className="screen__note">{t('common.loading')}</p>}
      {!tasksState.loading && tasksState.failed && (
        <p className="form__message form__message--bad" role="alert">
          {t('tasks.loadError')}
        </p>
      )}
      {!tasksState.loading && !tasksState.failed && tasks.length === 0 && (
        <p className="screen__note">{t('tasks.empty')}</p>
      )}

      {/* **רשימה אחת רצופה, בעמודה אחת, מהחדשה לישנה.** לפני כן היו
          כותרות קבוצה ("בהמשך", "ללא תאריך") ושתי עמודות מ-1024, וגם
          מיון לפי דחיפות. שלושתם ירדו בבקשת היזם: הכותרות חתכו רשימה
          קצרה לארבע פיסות, שתי עמודות מכריחות את העין לקפוץ, ומיון לפי
          יעד קבר משימה שנרשמה הרגע בתחתית. התאריך מופיע על השורה עצמה
          לצד החלקה, ושורה באיחור עדיין מסומנת. */}
      {!tasksState.loading && !tasksState.failed && (
        <div className="task-board__rows">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              plotName={showPlotName ? joinPlotNames(task.plotIds, tasksState.plotNames) : null}
              assignee={taskAssignee(task.assignedTo, membersState.currentUserId, byUserId)}
              onEdit={() => openEdit(task)}
              onCompleteCommit={() => handleComplete(task)}
              onDeleteCommit={() => handleDelete(task.id)}
            />
          ))}
        </div>
      )}

      <TaskSheet
        supabase={supabase}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        task={editingTask}
        defaultPlotId={plotId ?? null}
        farmId={tasksState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          tasksState.refresh();
        }}
      />
    </div>
  );
}
