import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { t } from './i18n';
import { writeOutcome, type WriteOutcome } from './postgrest';
import { useLoadCount } from './refresh';
import { formatLocalDateOnly } from './safeHarvestDate';

// משימות, שלב 3 משימה שנייה. אותה גישה כמו plots.ts, שני הלקוחות
// טוענים וכותבים דרך הפונקציות וההוקים כאן.
//
// הטיפוס הזה חושף רק את השדות שהפיצ'ר הזה בפועל קורא או כותב. notes,
// photo_url, voice_note_url, completed_by, created_log_id
// ו-created_expense_id קיימים בטבלה לצורך קול ו-Completion Prompts,
// משימות רודמאפ נפרדות. assigned_to נחשף עכשיו לשיתוף המשק (שלב 6).
export type Task = {
  id: string;
  farmId: string;
  // Every plot the task is attached to. Empty for a farm-level task. Read from
  // the task_plots join table, see 20260915120000_task_plots.sql.
  plotIds: string[];
  title: string;
  dueDate: string | null;
  // המשתמש שהמשימה משויכת אליו, שלב 6, שיתוף המשק. prd.md סעיף 11:
  // "לכל משימה למי היא מיועדת". null כשלא משויכת. tasks_view חושף את
  // העמודה, ו-RLS מתיר עדכון לכל חבר פעיל.
  assignedTo: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  snoozeCount: number;
  archivedAt: string | null;
  createdAt: string;
};

const TASK_COLUMNS =
  'id, farm_id, title, due_date, assigned_to, completed_at, snoozed_until, snooze_count, archived_at, created_at';

type TaskRow = {
  id: string;
  farm_id: string;
  title: string;
  due_date: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  snoozed_until: string | null;
  snooze_count: number;
  archived_at: string | null;
  created_at: string;
};

function mapTask(row: TaskRow, plotIds: string[]): Task {
  return {
    id: row.id,
    farmId: row.farm_id,
    plotIds,
    title: row.title,
    dueDate: row.due_date,
    assignedTo: row.assigned_to,
    completedAt: row.completed_at,
    snoozedUntil: row.snoozed_until,
    snoozeCount: row.snooze_count,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

// One tap on the Task Sheet's plot grid. A plot tile toggles that plot in or out
// of the set; the "general" tile (null) clears it, because a farm-level task is
// one with no plots. Both clients call this so the grid behaves the same.
export function toggleTaskPlot(plotIds: readonly string[], plotId: string | null): string[] {
  if (plotId === null) return [];
  return plotIds.includes(plotId) ? plotIds.filter((id) => id !== plotId) : [...plotIds, plotId];
}

// The plot label a task row shows: the names of its plots joined. Shared with the
// journal, whose farm-wide list shows one row per completed task. null when no
// plot is named, and plots that are
// no longer in the list (soft-deleted) are skipped rather than shown as blanks.
export function joinPlotNames(
  plotIds: readonly string[],
  plotNames: Map<string, string>,
): string | null {
  const names = plotIds
    .map((id) => plotNames.get(id))
    .filter((name): name is string => name !== undefined);
  return names.length > 0 ? names.join(', ') : null;
}

// ============================================================
// כלל הארכוב האוטומטי. משימה שנדחתה שלוש פעמים או שעברו עליה 30 יום
// בלי שהושלמה, prd.md סעיף 7. גרסה שקטה, בלי הפרומפט האינטראקטיבי
// "עדיין רלוונטי?" שב-design.md, זו החלטה מכוונת כדי לא לפתוח שדה
// מעקב נוסף על מונה ה-snooze הקיים. אפשר להוסיף את הפרומפט מאוחר יותר
// בלי לשנות את הכלל הזה.
// ============================================================

const ARCHIVE_AFTER_DAYS = 30;
const ARCHIVE_AFTER_SNOOZES = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function shouldAutoArchive(task: Task, now: Date = new Date()): boolean {
  if (task.archivedAt != null || task.completedAt != null) return false;
  if (task.snoozeCount >= ARCHIVE_AFTER_SNOOZES) return true;
  const ageDays = (now.getTime() - new Date(task.createdAt).getTime()) / MS_PER_DAY;
  return ageDays >= ARCHIVE_AFTER_DAYS;
}

// ============================================================
// שורת התאריך בשורת המשימה. design.md, Task Row, Due-date rendering
// ============================================================

export type DueTone = 'today' | 'tomorrow' | 'soon' | 'later' | 'overdue';
export type DueDisplay = { text: string; tone: DueTone };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function taskDueDisplay(dueDate: string | null, now: Date = new Date()): DueDisplay | null {
  if (!dueDate) return null;
  const today = startOfDay(now);
  const due = startOfDay(new Date(dueDate));
  const diffDays = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);

  if (diffDays < 0)
    return { text: `${t('tasks.due.overduePrefix')} ${-diffDays}`, tone: 'overdue' };
  if (diffDays === 0) return { text: t('tasks.due.today'), tone: 'today' };
  if (diffDays === 1) return { text: t('tasks.due.tomorrow'), tone: 'tomorrow' };
  if (diffDays <= 7) return { text: `${t('tasks.due.inDaysPrefix')} ${diffDays}`, tone: 'soon' };
  return {
    text: due.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
    tone: 'later',
  };
}

// **קיבוץ הלוח לפי דחיפות נמחק ב-2026-09-25.** כאן ישבו
// `groupTasksByUrgency` ו-`sortTasksByUrgency`, שסידרו את הלוח לחמש
// קבוצות, באיחור והיום והשבוע ובהמשך וללא תאריך. הכותרות ירדו מהמסך
// בבקשת היזם, ואז גם המיון עצמו: רשימה אחת ממוינת מהחדשה לישנה, והמיון
// קורה ב-`useTasks` במסד. `taskDueDisplay` למעלה נשארה, כי השורה עדיין
// מציגה את התאריך שלה ועדיין מסמנת איחור.

// ============================================================
// רשימת משימות פתוחות. plotId מוגבל למשימות של חלקה אחת, לטאב משימות
// בפרטי חלקה. בלעדיו, כל המשימות הפתוחות של המשק, ללוח בבית.
//
// Separate queries rather than embeds: tasks_view is a view, and PostgREST does
// not derive foreign keys from it. Plot links and plot names are joined in code.
// ============================================================

export type TasksListState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  tasks: Task[];
  plotNames: Map<string, string>;
  refresh: () => void;
  // Completed loads, for pull-to-refresh. See refresh.ts.
  loadCount: number;
};

export function useTasks(supabase: SupabaseClient, plotId?: string): TasksListState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plotNames, setPlotNames] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);
  const { loadCount, settle } = useLoadCount();

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: farmRows, error: farmError } = await currentFarmQuery(supabase);
      const farm = (farmRows as { id: string }[] | null)?.[0];
      if (!active) return;
      if (farmError || !farm) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }
      setFarmId(farm.id);

      // A plot's tasks are the ones with a join row for it, so the join table is
      // asked first and the task query is narrowed to those ids.
      let plotTaskIds: string[] | null = null;
      if (plotId) {
        const { data: linkRows, error: linkError } = await supabase
          .from('task_plots')
          .select('task_id')
          .eq('plot_id', plotId);
        if (!active) return;
        if (linkError) {
          setFailed(true);
          setLoading(false);
          settle();
          return;
        }
        plotTaskIds = ((linkRows ?? []) as { task_id: string }[]).map((row) => row.task_id);
      }

      let query = supabase
        .from('tasks_view')
        .select(TASK_COLUMNS)
        .eq('farm_id', farm.id)
        .is('completed_at', null)
        .is('archived_at', null);
      if (plotTaskIds) query = query.in('id', plotTaskIds);

      const [tasksResult, plotsResult] = await Promise.all([
        // **מהחדשה לישנה, בבקשת היזם 2026-09-25.** קודם המיון היה לפי
        // תאריך יעד עולה, והלוח סידר את התוצאה לקבוצות דחיפות. הקבוצות
        // ירדו, ואיתן הסיבה למיין לפי יעד: רשימה שטוחה שממוינת לפי יעד
        // קוברת משימה שנרשמה הרגע בתחתית, מתחת לכל מה שכבר יש לו תאריך.
        //
        // המיון במסד ולא בקליינט, כדי שלא יהיה עותק שני שלו בכל לוח.
        query.order('created_at', { ascending: false }),
        supabase.from('plots').select('id, name').eq('farm_id', farm.id).is('deleted_at', null),
      ]);

      if (!active) return;
      if (tasksResult.error || plotsResult.error) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      const rows = (tasksResult.data ?? []) as TaskRow[];
      const plotIdsByTask = new Map<string, string[]>();
      if (rows.length > 0) {
        const { data: linkRows, error: linkError } = await supabase
          .from('task_plots')
          .select('task_id, plot_id')
          .in(
            'task_id',
            rows.map((row) => row.id),
          );
        if (!active) return;
        if (linkError) {
          setFailed(true);
          setLoading(false);
          settle();
          return;
        }
        for (const link of (linkRows ?? []) as { task_id: string; plot_id: string }[]) {
          const list = plotIdsByTask.get(link.task_id) ?? [];
          list.push(link.plot_id);
          plotIdsByTask.set(link.task_id, list);
        }
      }
      const loaded = rows.map((row) => mapTask(row, plotIdsByTask.get(row.id) ?? []));

      // ארכוב אוטומטי, שקט ו-best-effort. הבדיקה קורית בכל טעינה, לא
      // ב-cron וב-worker נפרד, כי אין עדיין תשתית תור כתיבה (הבולט
      // האחרון ברודמאפ שלב 3). משימה שחצתה את הסף מוסרת מהתצוגה מיד
      // ונשמרת ל-DB ברקע, בלי לחסום את הרינדור.
      const stale = loaded.filter((task) => shouldAutoArchive(task));
      for (const task of stale) {
        void archiveTask(supabase, task.id);
      }
      const staleIds = new Set(stale.map((task) => task.id));
      const visible = loaded.filter((task) => !staleIds.has(task.id));

      const plotRows = (plotsResult.data ?? []) as { id: string; name: string }[];
      setPlotNames(new Map(plotRows.map((row) => [row.id, row.name])));
      setTasks(visible);
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, plotId, tick, settle]);

  return { loading, failed, farmId, tasks, plotNames, refresh, loadCount };
}

// ============================================================
// TaskCostMemory. prd.md סעיף 7: "העלות היא שדה אחד שהאפליקציה זוכרת...
// בפעם הבאה שהוא פותח משימה עם אותה כותרת השדה כבר מלא במה שרשם קודם".
// בלי נוסחאות, רק הערך האחרון לפי כותרת מנורמלת.
//
// task_cost_memory לא עבר את ה-REVOKE הגורף שתפס את crop_cycles ו-tasks
// (core_schema.sql מעניק SELECT מלא על הטבלה מלכתחילה), כי היא כולה
// כסף וחסומה לעובד ברמת השורה, לא ממוסכת בעמודות בתוך view. אין כאן
// אותו פער.
// ============================================================

// נרמול לפי prd.md: "אותה כותרת" בעיני חקלאי כולל רווחים כפולים
// ורישיות שונות, לא רק התאמה מדויקת של המחרוזת. בעברית אין רישיות,
// אבל כותרת יכולה לכלול מילה או ראשי תיבות בלועזית.
export function normalizeTaskTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

// null גם כשאין זיכרון וגם כשאין הרשאה (worker), אין צורך להבחין
// ביניהם כאן, שני המקרים אומרים לשדה "אל תמלא כלום".
export async function taskCostMemory(
  supabase: SupabaseClient,
  farmId: string,
  title: string,
): Promise<number | null> {
  const titleNormalized = normalizeTaskTitle(title);
  if (!titleNormalized) return null;

  const { data } = await supabase
    .from('task_cost_memory')
    .select('last_cost')
    .eq('farm_id', farmId)
    .eq('title_normalized', titleNormalized)
    .maybeSingle();
  return (data as { last_cost: number } | null)?.last_cost ?? null;
}

// Best-effort: it neither blocks nor reports failure. Cost memory is a convenience, not part
// of the task's truth; if this write fails the expense itself is already saved
// and there is nothing to show the farmer as an error.
//
// Called only from Completion Prompts, when the farmer confirms an expense at
// "done" -- a task itself carries no cost. See completionPrompts.ts.
export async function rememberTaskCost(
  supabase: SupabaseClient,
  farmId: string,
  title: string,
  cost: number,
): Promise<void> {
  const titleNormalized = normalizeTaskTitle(title);
  if (!titleNormalized) return;

  await supabase.from('task_cost_memory').upsert(
    {
      farm_id: farmId,
      title_normalized: titleNormalized,
      last_cost: cost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'farm_id,title_normalized' },
  );
}

// ============================================================
// Create and edit. Every field but the title is optional (prd.md section 7).
// A task has no estimated cost; see 20260915120000_task_plots.sql.
// ============================================================

export type TaskInput = {
  title: string;
  // The plots the task is attached to. [] is a farm-level task.
  plotIds: string[];
  dueDate: string | null;
  // The member the task is assigned to, stage 6. null when unassigned.
  assignedTo: string | null;
};

// **The update half of TaskInput, where an absent field means "leave it alone".**
// The title stays required because a task without one is not a task and updateTask
// refuses it anyway; everything else is optional, `undefined` says "I do not have
// this" and an explicit `null` still says "clear it". For `plotIds` an array is the
// whole new set -- [] detaches every plot -- and `undefined` does not touch the
// join rows at all. The same convention updateCropCycle and updateForecast use in
// plots.ts.
//
// `TaskInput` is assignable to this, so nothing that genuinely has the whole task
// has to change.
export type TaskUpdate = { title: string } & Partial<Omit<TaskInput, 'title'>>;

export type TaskWriteResult =
  { ok: true } | { ok: false; reason: 'titleRequired' | 'forbidden' | 'error' };

// One payload builder for both writes, so create and update cannot drift into two
// different ideas of the same row. On an insert an absent field simply leaves the
// column at its default, which is null for every one of them, so the same
// conditional spread is correct in both directions. The plot set is not a column
// of tasks and is written by writeTaskPlots.
function taskPayload(title: string, input: TaskUpdate) {
  return {
    title,
    ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
    ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
  };
}

// Makes a task's plot set exactly `plotIds`. Only the difference is written: rows
// no longer in the set are deleted and missing ones inserted, so saving a task
// whose plots did not change costs one read and no writes.
async function writeTaskPlots(
  supabase: SupabaseClient,
  taskId: string,
  plotIds: string[],
): Promise<TaskWriteResult> {
  const current = await supabase.from('task_plots').select('plot_id').eq('task_id', taskId);
  if (current.error) return { ok: false, reason: 'error' };
  const existing = new Set(
    ((current.data ?? []) as { plot_id: string }[]).map((row) => row.plot_id),
  );
  const wanted = new Set(plotIds);
  const toRemove = [...existing].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !existing.has(id));

  if (toRemove.length > 0) {
    const removed = writeOutcome(
      await supabase
        .from('task_plots')
        .delete()
        .eq('task_id', taskId)
        .in('plot_id', toRemove)
        .select('plot_id'),
    );
    if (!removed.ok) return removed;
  }
  if (toAdd.length > 0) {
    const added = writeOutcome(
      await supabase
        .from('task_plots')
        .insert(toAdd.map((plotId) => ({ task_id: taskId, plot_id: plotId })))
        .select('plot_id'),
    );
    if (!added.ok) return added;
  }
  return { ok: true };
}

// **createTask takes the same partial input as updateTask, and that is safe here
// in a way it would not be on an update.** An absent column on an INSERT takes the
// table's default, which is null for all of them, and an absent plot set means no
// join rows -- exactly what "the sheet did not ask" means on a brand-new task.
// `TaskInput` (every field stated) stays the shape voiceConfirm.ts builds.
export async function createTask(
  supabase: SupabaseClient,
  farmId: string,
  input: TaskUpdate,
): Promise<TaskWriteResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'titleRequired' };

  const write = await supabase
    .from('tasks')
    .insert({ farm_id: farmId, ...taskPayload(title, input) })
    .select('id');
  const outcome = writeOutcome(write);
  if (!outcome.ok) return outcome;
  const taskId = (write.data as { id: string }[] | null)?.[0]?.id;
  if (taskId && input.plotIds !== undefined && input.plotIds.length > 0) {
    return writeTaskPlots(supabase, taskId, input.plotIds);
  }
  return outcome;
}

// A field this input does not carry is not written. See TaskUpdate.
export async function updateTask(
  supabase: SupabaseClient,
  taskId: string,
  _farmId: string,
  input: TaskUpdate,
): Promise<TaskWriteResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'titleRequired' };

  const outcome = writeOutcome(
    await supabase.from('tasks').update(taskPayload(title, input)).eq('id', taskId).select('id'),
  );
  if (!outcome.ok) return outcome;
  if (input.plotIds !== undefined) {
    return writeTaskPlots(supabase, taskId, input.plotIds);
  }
  return outcome;
}

// ============================================================
// השלמה כאירוע. completed_at הוא append-only, אין קריאה שהופכת אותו
// חזרה ל-null, ראה core_schema.sql. ה-undo של חמש השניות ב-Task Row
// (design.md, Swipe Actions) ממומש לכן בקליינט לפני שהכתיבה הזו בכלל
// נשלחת, לא כביטול אחרי כתיבה, ראו רכיב TaskRow.
// ============================================================

export async function completeTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<WriteOutcome> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  const write = await supabase
    .from('tasks')
    .update({ completed_at: new Date().toISOString(), completed_by: userId })
    .eq('id', taskId)
    .select('id');
  return writeOutcome(write);
}

// ============================================================
// דחייה (snooze). שבוע קדימה בדיוק, לפי הכפתור היחיד ש-design.md מגדיר
// ("דחה שבוע"), ומעלה את המונה. אם המונה חוצה את סף הארכוב באותה
// הזדמנות, נסגר גם archived_at באותה כתיבה, לא בסבב נפרד.
// ============================================================

export async function snoozeTask(
  supabase: SupabaseClient,
  task: Pick<Task, 'id' | 'snoozeCount'>,
): Promise<WriteOutcome> {
  const nextCount = task.snoozeCount + 1;
  // A week on the farmer's calendar. toISOString here would snooze until the
  // sixth day whenever he pressed the button after 21:00 Israel time.
  const snoozedUntil = formatLocalDateOnly(new Date(Date.now() + 7 * MS_PER_DAY));
  const write = await supabase
    .from('tasks')
    .update({
      snoozed_until: snoozedUntil,
      snooze_count: nextCount,
      ...(nextCount >= ARCHIVE_AFTER_SNOOZES ? { archived_at: new Date().toISOString() } : {}),
    })
    .eq('id', task.id)
    .select('id');
  return writeOutcome(write);
}

export async function archiveTask(supabase: SupabaseClient, taskId: string): Promise<WriteOutcome> {
  const write = await supabase
    .from('tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('id');
  return writeOutcome(write);
}

// מחיקה, לא השלמה. בקשת חקלאי מפורשת: לפעמים משימה פשוט לא רלוונטית
// יותר ואין טעם לרשום אותה כ"בוצע" (שקורא בעתיד ל-Completion Prompts,
// "להוסיף ליומן/הוצאות?"). soft delete בלבד, deleted_at כבר קיים
// בסכמה מ-core_schema.sql ומסונן ב-tasks_view, לא UPDATE חדש ולא מחיקת
// שורה בפועל.
export async function deleteTask(supabase: SupabaseClient, taskId: string): Promise<WriteOutcome> {
  const write = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('id');
  return writeOutcome(write);
}
