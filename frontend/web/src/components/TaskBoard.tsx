import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  completeTask,
  deleteTask,
  groupTasksByUrgency,
  t,
  useTasks,
  type Currency,
  type Task,
} from '@yevul/shared';
import { TaskRow } from './TaskRow';
import { TaskSheet } from './TaskSheet';
import './TaskBoard.css';

// לוח המשימות, design.md "Task Board". רכיב תוכן, לא מסך, מרונדר גם
// בבית (כל המשק) וגם בטאב משימות בפרטי חלקה (חלקה אחת בלבד), אותה
// שורה ואותה שאילתה מצומצמת. plotId קובע את ההבדל, showPlotName קובע
// אם שם החלקה חוזר על עצמו בכל שורה, מיותר כשכבר בתוך מסך אותה חלקה.
export function TaskBoard({
  supabase,
  plotId,
  showPlotName,
  currency,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
  currency: Currency;
}) {
  const tasksState = useTasks(supabase, plotId);
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

  async function handleComplete(taskId: string) {
    await completeTask(supabase, taskId);
    tasksState.refresh();
  }

  async function handleDelete(taskId: string) {
    await deleteTask(supabase, taskId);
    tasksState.refresh();
  }

  const groups = groupTasksByUrgency(tasksState.tasks);

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
      {!tasksState.loading && !tasksState.failed && groups.length === 0 && (
        <p className="screen__note">{t('tasks.empty')}</p>
      )}

      {!tasksState.loading &&
        !tasksState.failed &&
        groups.map((group) => (
          <div key={group.key} className="task-board__group">
            <p className="task-board__section-header">{t(group.labelKey)}</p>
            <div className="task-board__rows">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  plotName={
                    showPlotName ? (tasksState.plotNames.get(task.plotId ?? '') ?? null) : null
                  }
                  currency={currency}
                  onEdit={() => openEdit(task)}
                  onCompleteCommit={() => handleComplete(task.id)}
                  onDeleteCommit={() => handleDelete(task.id)}
                />
              ))}
            </div>
          </div>
        ))}

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
