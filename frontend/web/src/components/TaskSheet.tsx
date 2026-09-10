import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assignableMembers,
  createTask,
  formatLocalDateOnly,
  t,
  updateTask,
  useMembers,
  usePlots,
  type Task,
} from '@yevul/shared';
import { DateField } from './DateField';
import { Modal } from './Modal';
import { TilePicker } from './TilePicker';

type DueMode = 'someday' | 'week' | 'date';

// TilePicker values are strings, so the "general" (no plot) and "unassigned"
// (no member) tiles carry an empty-string sentinel that maps back to null on
// select. Plot ids and user ids are UUIDs and never empty, so nothing clashes.
const NONE = '';

// **The three modes stay and the calendar sits behind the third**, the same
// shape the mobile sheet keeps. They are this field's own shortcuts and they
// already point forwards, which is why the today / yesterday / the-day-before
// squares the expense and journal dialogs got would be wrong here.
//
// "This week" is still a week on the user's own calendar. toISOString would
// make it six days whenever the button is pressed between local midnight and
// 02:00 or 03:00.
function computeDueDate(mode: DueMode, customDate: string | null, now: Date): string | null {
  if (mode === 'someday') return null;
  if (mode === 'week') {
    return formatLocalDateOnly(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  }
  return customDate;
}

// גיליון יצירה/עריכה של משימה, design.md "Task Sheet", כדיאלוג ממורכז
// (Modal) במקום גיליון תחתון, לפי אותה הפרדה שכבר קיימת בין הלקוחות
// לשדות בחירה: תפריט נפתח בווב, שורת צ'יפים בנייד (ראה roadmap.md,
// שלב 2). כותרת, חלקה, תאריך, בלי עלות: עלות שאלה על "בוצע", לא על
// יצירה, ראה Completion Prompts (טרם נבנה). בלי כפתורי מצלמה ומיקרופון,
// אלה תלויים בתשתית הקול של שלב 5.
export function TaskSheet({
  supabase,
  open,
  onClose,
  task,
  defaultPlotId,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  open: boolean;
  onClose: () => void;
  task: Task | null;
  defaultPlotId: string | null;
  farmId: string | null;
  onSaved: () => void;
}) {
  const plotsState = usePlots(supabase);
  // הרוסטר לבורר האחראי, שלב 6. הבורר מופיע רק כשיש חברים שאפשר
  // להציב, ולכן נעלם לגמרי במשק של אדם אחד (design.md, Sharing).
  const membersState = useMembers(supabase);
  const assignable = assignableMembers(membersState.members);

  const [title, setTitle] = useState('');
  const [plotId, setPlotId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [dueMode, setDueMode] = useState<DueMode>('someday');
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'titleRequired' | 'forbidden' | 'error'>(
    'idle',
  );
  const busy = status === 'saving';

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setPlotId(task.plotId);
      setAssignedTo(task.assignedTo);
      if (task.dueDate) {
        setDueMode('date');
        setCustomDate(task.dueDate);
      } else {
        setDueMode('someday');
        setCustomDate(null);
      }
    } else {
      setTitle('');
      setPlotId(defaultPlotId);
      setAssignedTo(null);
      setDueMode('someday');
      setCustomDate(null);
    }
    setStatus('idle');
  }, [open, task, defaultPlotId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!farmId) return;
    setStatus('saving');
    const input = {
      title,
      plotId,
      dueDate: computeDueDate(dueMode, customDate, new Date()),
      // עלות משוערת ירדה מהגיליון: היא שאלה ששייכת ל"בוצע", לא ליצירה.
      // ראה ההערה למעלה ליד TaskSheet.
      //
      // **`estimatedCost` is not passed at all, and passing `null` here was a real
      // bug.** This sheet has no cost box, but voice sets a cost (voiceConfirm.ts)
      // and both clients show it (TaskRow), so a farmer could speak "לרסס את
      // הכרם, מאתיים שקל", reopen the task to fix a typo in the title, and the two
      // hundred was gone with nothing said. Leaving the field out means updateTask
      // does not touch the column; see TaskUpdate in packages/shared/src/tasks.ts.
      // On a create there is nothing to lose either way -- the column defaults to
      // null, which is what this sheet means.
      //
      // **The roster guard is a `undefined` and not a `null` for the same reason,
      // one step subtler.** `assignableMembers` returns [] while useMembers is
      // still loading, not only when the farm really is a one-man operation, so the
      // old `assignable.length > 0 ? assignedTo : null` unassigned a task whenever
      // the farmer hit save before the member list came back. Now: no picker on
      // screen, nothing written.
      ...(assignable.length > 0 ? { assignedTo } : {}),
    };
    const result = task
      ? await updateTask(supabase, task.id, farmId, input)
      : await createTask(supabase, farmId, input);
    if (result.ok) {
      onSaved();
      return;
    }
    setStatus(result.reason === 'titleRequired' ? 'titleRequired' : result.reason);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="screen__title">
        {task ? t('tasks.form.titleEdit') : t('tasks.form.titleNew')}
      </h2>
      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="form__label" htmlFor="task-title">
            {t('tasks.form.titlePlaceholder')}
          </label>
          <input
            id="task-title"
            className="form__input"
            type="text"
            value={title}
            placeholder={t('tasks.form.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </div>

        {/* בורר החלקה כקוביות, אותה תבנית בדיוק שההוצאה והחלקה משתמשות
            בה, במקום התפריט הנפתח. הקובייה "כללי" היא ה-null, ראה NONE. */}
        <TilePicker
          id="task-step-plot"
          title={t('plots.form.name')}
          options={[
            { value: NONE, label: t('tasks.plotGeneral') },
            ...plotsState.plots.map((plot) => ({ value: plot.id, label: plot.name })),
          ]}
          selectedValue={plotId ?? NONE}
          onSelect={(value) => setPlotId(value === NONE ? null : value)}
          disabled={busy}
        />

        {/* בורר האחראי, שלב 6, כקוביות במקום תפריט נפתח. מופיע רק כשיש
            במשק חברים שאפשר להציב, ולכן נעלם לגמרי במשק של אדם אחד,
            design.md, Sharing. הקובייה "לא משויך" היא ה-null, ראה NONE. */}
        {assignable.length > 0 && (
          <TilePicker
            id="task-step-assignee"
            title={t('tasks.form.assignee')}
            options={[
              { value: NONE, label: t('tasks.form.assigneeNone') },
              ...assignable.map((member) => ({
                value: member.userId ?? NONE,
                label: member.email ?? member.userId ?? '',
              })),
            ]}
            selectedValue={assignedTo ?? NONE}
            onSelect={(value) => setAssignedTo(value === NONE ? null : value)}
            disabled={busy}
          />
        )}

        {/* מצב התאריך כקוביות ולא תפריט נפתח: מתישהו / השבוע / תאריך,
            אותה תבנית כמו החלקה והאחראי. כשנבחר "תאריך" נפתח לוח השנה מתחת. */}
        <TilePicker
          id="task-step-due"
          title={t('tasks.form.due')}
          options={[
            { value: 'someday', label: t('tasks.form.dueSomeday') },
            { value: 'week', label: t('tasks.form.dueWeek') },
            { value: 'date', label: t('tasks.form.dueDate') },
          ]}
          selectedValue={dueMode}
          onSelect={(value) => setDueMode(value as DueMode)}
          disabled={busy}
        />

        {/* **The one place in the app where the calendar looks forwards.** A
            due date is a target, so days behind today are not clickable --
            except the one an overdue task is already carrying, which
            calendarBounds keeps selectable so editing such a task cannot argue
            with its own record. No shortcut chips: the mode tiles above are
            this field's shortcut, and the calendar is always open here because
            there is nothing to fold it behind. */}
        {dueMode === 'date' && (
          <DateField
            id="task-due-date"
            label={t('tasks.form.dueDate')}
            value={customDate}
            onChange={setCustomDate}
            direction="future"
            shortcuts={false}
            disabled={busy}
          />
        )}

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={busy}>
            {busy ? t('tasks.saving') : t('tasks.save')}
          </button>
          <button type="button" className="form__cancel" onClick={onClose} disabled={busy}>
            {t('plots.detail.back')}
          </button>
          {status === 'titleRequired' && (
            <p className="form__message form__message--bad" role="alert">
              {t('tasks.form.titleRequired')}
            </p>
          )}
          {status === 'forbidden' && (
            <p className="form__message form__message--bad" role="alert">
              {t('tasks.form.forbidden')}
            </p>
          )}
          {status === 'error' && (
            <p className="form__message form__message--bad" role="alert">
              {t('tasks.form.saveError')}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
