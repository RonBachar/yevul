import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { t } from './i18n';
import { writeOutcome, type WriteOutcome } from './postgrest';

// משימות, שלב 3 משימה שנייה. אותה גישה כמו plots.ts, שני הלקוחות
// טוענים וכותבים דרך הפונקציות וההוקים כאן.
//
// הטיפוס הזה חושף רק את השדות שהפיצ'ר הזה בפועל קורא או כותב. notes,
// photo_url, voice_note_url, assigned_to, completed_by, created_log_id
// ו-created_expense_id קיימים בטבלה לצורך קול, שיתוף ו-Completion
// Prompts, שלושתם משימות רודמאפ נפרדות שעוד לא נבנו.
export type Task = {
  id: string;
  farmId: string;
  plotId: string | null;
  title: string;
  dueDate: string | null;
  estimatedCost: number | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  snoozeCount: number;
  archivedAt: string | null;
  createdAt: string;
};

const TASK_COLUMNS =
  'id, farm_id, plot_id, title, due_date, estimated_cost, completed_at, snoozed_until, snooze_count, archived_at, created_at';

type TaskRow = {
  id: string;
  farm_id: string;
  plot_id: string | null;
  title: string;
  due_date: string | null;
  estimated_cost: number | null;
  completed_at: string | null;
  snoozed_until: string | null;
  snooze_count: number;
  archived_at: string | null;
  created_at: string;
};

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    farmId: row.farm_id,
    plotId: row.plot_id,
    title: row.title,
    dueDate: row.due_date,
    estimatedCost: row.estimated_cost,
    completedAt: row.completed_at,
    snoozedUntil: row.snoozed_until,
    snoozeCount: row.snooze_count,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
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

// ============================================================
// קיבוץ הלוח לפי דחיפות. design.md, Task Board: באיחור → היום → השבוע
// → מתישהו, קבוצות ריקות לא מוצגות.
// ============================================================

export type UrgencyGroupKey = 'overdue' | 'today' | 'week' | 'someday';
export type UrgencyGroup = { key: UrgencyGroupKey; labelKey: string; tasks: Task[] };

export function groupTasksByUrgency(tasks: Task[], now: Date = new Date()): UrgencyGroup[] {
  const buckets: Record<UrgencyGroupKey, Task[]> = {
    overdue: [],
    today: [],
    week: [],
    someday: [],
  };

  for (const task of tasks) {
    const due = taskDueDisplay(task.dueDate, now);
    if (!due) {
      buckets.someday.push(task);
    } else if (due.tone === 'overdue') {
      buckets.overdue.push(task);
    } else if (due.tone === 'today' || due.tone === 'tomorrow') {
      buckets.today.push(task);
    } else {
      buckets.week.push(task);
    }
  }

  const order: { key: UrgencyGroupKey; labelKey: string }[] = [
    { key: 'overdue', labelKey: 'tasks.group.overdue' },
    { key: 'today', labelKey: 'tasks.group.today' },
    { key: 'week', labelKey: 'tasks.group.week' },
    { key: 'someday', labelKey: 'tasks.group.someday' },
  ];

  return order
    .map(({ key, labelKey }) => ({ key, labelKey, tasks: buckets[key] }))
    .filter((group) => group.tasks.length > 0);
}

// ============================================================
// רשימת משימות פתוחות. plotId מוגבל למשימות של חלקה אחת, לטאב משימות
// בפרטי חלקה. בלעדיו, כל המשימות הפתוחות של המשק, ללוח בבית.
//
// שתי שאילתות ולא הטמעה, אותה סיבה בדיוק כמו ב-plots.ts: tasks_view
// הוא view שממסך estimated_cost לפי תפקיד, ו-PostgREST לא גוזר ממנו
// קשר זר. שם החלקה מצטרף בקוד.
// ============================================================

export type TasksListState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  tasks: Task[];
  plotNames: Map<string, string>;
  refresh: () => void;
};

export function useTasks(supabase: SupabaseClient, plotId?: string): TasksListState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plotNames, setPlotNames] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);

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
        return;
      }
      setFarmId(farm.id);

      let query = supabase
        .from('tasks_view')
        .select(TASK_COLUMNS)
        .eq('farm_id', farm.id)
        .is('completed_at', null)
        .is('archived_at', null);
      if (plotId) query = query.eq('plot_id', plotId);

      const [tasksResult, plotsResult] = await Promise.all([
        query.order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('plots').select('id, name').eq('farm_id', farm.id).is('deleted_at', null),
      ]);

      if (!active) return;
      if (tasksResult.error || plotsResult.error) {
        setFailed(true);
        setLoading(false);
        return;
      }

      const rows = (tasksResult.data ?? []) as TaskRow[];
      const loaded = rows.map(mapTask);

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
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, plotId, tick]);

  return { loading, failed, farmId, tasks, plotNames, refresh };
}

// ============================================================
// יצירה ועריכה. שני שדות התאריך והעלות אופציונליים לגמרי, prd.md
// סעיף 7: "משימה היא כותרת, ואופציונלית גם חלקה, תאריך יעד ועלות
// משוערת". עלות משוערת היא שדה מספרי רגיל כאן, בלי מילוי מראש מ-
// TaskCostMemory, זו משימת רודמאפ נפרדת (הבאה אחרי זו).
// ============================================================

export type TaskInput = {
  title: string;
  plotId: string | null;
  dueDate: string | null;
  estimatedCost: number | null;
};

export type TaskWriteResult =
  { ok: true } | { ok: false; reason: 'titleRequired' | 'forbidden' | 'error' };

export async function createTask(
  supabase: SupabaseClient,
  farmId: string,
  input: TaskInput,
): Promise<TaskWriteResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'titleRequired' };

  const write = await supabase
    .from('tasks')
    .insert({
      farm_id: farmId,
      plot_id: input.plotId,
      title,
      due_date: input.dueDate,
      estimated_cost: input.estimatedCost,
    })
    .select('id');
  return writeOutcome(write);
}

export async function updateTask(
  supabase: SupabaseClient,
  taskId: string,
  input: TaskInput,
): Promise<TaskWriteResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'titleRequired' };

  const write = await supabase
    .from('tasks')
    .update({
      plot_id: input.plotId,
      title,
      due_date: input.dueDate,
      estimated_cost: input.estimatedCost,
    })
    .eq('id', taskId)
    .select('id');
  return writeOutcome(write);
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
  const snoozedUntil = new Date(Date.now() + 7 * MS_PER_DAY).toISOString().slice(0, 10);
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
