import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  completeTask,
  completionPromptVisibility,
  deleteTask,
  groupTasksByUrgency,
  membersByUserId,
  t,
  taskAssignee,
  tasksOnPlots,
  useFarmSettings,
  useMembers,
  useTasks,
  workerModeShell,
  type Task,
} from '@yevul/shared';
import { CompletionPromptSheet } from './CompletionPromptSheet';
import { TaskRow } from './TaskRow';
import { TaskSheet } from './TaskSheet';
import './TaskBoard.css';

// לוח המשימות, design.md "Task Board". רכיב תוכן, לא מסך, מרונדר גם
// בבית (כל המשק) וגם בטאב משימות בפרטי חלקה (חלקה אחת בלבד), אותה
// שורה ואותה שאילתה מצומצמת. plotId קובע את ההבדל, showPlotName קובע
// אם שם החלקה חוזר על עצמו בכל שורה, מיותר כשכבר בתוך מסך אותה חלקה.
//
// useFarmSettings נקרא כאן ולא מקבל currency כפרופ מההורה יותר: ברגע
// שהלוח זקוק גם למתגי Completion Prompts, אין טעם שההורה ימשיך למשוך
// הגדרות רק כדי להעביר שדה אחד ממנו הלאה.
//
// plotIds הוא הצד ה"שלי" של מתג החלקות בבית (design.md, "My Plots"
// Toggle): כשהוא מסופק, הלוח מצטמצם למשימות שעל אותן חלקות בלבד. הוא
// תוספת נפרדת ממסלול plotId של חלקה יחידה, ובתצוגת "הכל" ובפרטי חלקה
// הוא פשוט נשאר undefined, כלומר בלי סינון.
export function TaskBoard({
  supabase,
  plotId,
  plotIds,
  showPlotName,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  plotIds?: string[];
  showPlotName: boolean;
}) {
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';
  // Worker Mode, design.md: "The expense half of the Completion Prompts never
  // fires; the journal half still can." worker חסום מכתיבת הוצאה במסד, ולכן
  // שאלת ההוצאה בסיום משימה הייתה נגמרת ב"אין הרשאה". ההחלטה עצמה טהורה
  // ב-workerModeShell.
  const tasksState = useTasks(supabase, plotId);
  // הרוסטר נטען פעם אחת ללוח ומומר למיפוי, כדי ששורת המשימה תפתור את
  // assigned_to לראשי תיבות בלי שאילתה לכל שורה, design.md, Member Avatar.
  const membersState = useMembers(supabase);
  // התפקיד נגזר מ-useMembers (is_self) ולא בהוק useMyRole נפרד, כדי לא
  // לשאול את farm_members_view פעמיים באותו לוח.
  const shell = workerModeShell(membersState.myRole, membersState.loading);
  const byUserId = useMemo(() => membersByUserId(membersState.members), [membersState.members]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);

  function openCreate() {
    setEditingTask(null);
    setSheetOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setSheetOpen(true);
  }

  const promptVisibility = completionPromptVisibility(
    settings.form?.journalPromptEnabled ?? false,
    settings.form?.expensePromptEnabled ?? false,
    !shell.showExpenseCompletionPrompt,
  );

  async function handleComplete(taskId: string) {
    const task = tasksState.tasks.find((candidate) => candidate.id === taskId) ?? null;
    await completeTask(supabase, taskId);
    tasksState.refresh();
    // Completion Prompts מוצג רק אחרי שהכתיבה בפועל הצליחה, במקום
    // ה-undo toast של חמש שניות שכבר חלף עד שהגענו לכאן.
    if (task && promptVisibility.showPrompt) setCompletingTask(task);
  }

  async function handleDelete(taskId: string) {
    await deleteTask(supabase, taskId);
    tasksState.refresh();
  }

  const groups = groupTasksByUrgency(tasksOnPlots(tasksState.tasks, plotIds));

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

      {/* עוטף אחד לכל הקבוצות, כדי שהן תוכלנה לזרום לשתי עמודות
          ברוחב גדול. בלעדיו כל קבוצה היא ילד ישיר של flex column
          ואין למה להחיל את ה-columns. ראה TaskBoard.css. */}
      {!tasksState.loading && !tasksState.failed && (
        <div className="task-board__groups">
          {groups.map((group) => (
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
                    assignee={taskAssignee(task.assignedTo, membersState.currentUserId, byUserId)}
                    onEdit={() => openEdit(task)}
                    onCompleteCommit={() => handleComplete(task.id)}
                    onDeleteCommit={() => handleDelete(task.id)}
                  />
                ))}
              </div>
            </div>
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

      <CompletionPromptSheet
        supabase={supabase}
        open={completingTask != null}
        task={completingTask}
        farmId={tasksState.farmId}
        currency={currency}
        journalEnabled={promptVisibility.showJournal}
        expenseEnabled={promptVisibility.showExpense}
        onClose={() => setCompletingTask(null)}
      />
    </div>
  );
}
