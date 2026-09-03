import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTask, formatLocalDateOnly, t, updateTask, usePlots, type Task } from '@yevul/shared';
import { DateField } from './DateField';
import { Modal } from './Modal';

type DueMode = 'someday' | 'week' | 'date';

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

  const [title, setTitle] = useState('');
  const [plotId, setPlotId] = useState<string | null>(null);
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
      estimatedCost: null,
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

        <div className="form__row">
          <label className="form__label" htmlFor="task-plot">
            {t('plots.form.name')}
          </label>
          <select
            id="task-plot"
            className="form__input"
            value={plotId ?? ''}
            onChange={(e) => setPlotId(e.target.value === '' ? null : e.target.value)}
            disabled={busy || plotsState.loading}
          >
            <option value="">{t('tasks.plotGeneral')}</option>
            {plotsState.plots.map((plot) => (
              <option key={plot.id} value={plot.id}>
                {plot.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="task-due-mode">
            {t('tasks.form.due')}
          </label>
          <select
            id="task-due-mode"
            className="form__input"
            value={dueMode}
            onChange={(e) => setDueMode(e.target.value as DueMode)}
            disabled={busy}
          >
            <option value="someday">{t('tasks.form.dueSomeday')}</option>
            <option value="week">{t('tasks.form.dueWeek')}</option>
            <option value="date">{t('tasks.form.dueDate')}</option>
          </select>
        </div>

        {/* **The one place in the app where the calendar looks forwards.** A
            due date is a target, so days behind today are not clickable --
            except the one an overdue task is already carrying, which
            calendarBounds keeps selectable so editing such a task cannot argue
            with its own record. No shortcut chips: the mode select above is
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
