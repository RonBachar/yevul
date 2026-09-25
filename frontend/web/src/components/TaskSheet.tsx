import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTask, t, updateTask, usePlots, type Task } from '@yevul/shared';
import { DateField } from './DateField';
import { Modal } from './Modal';

// The "general" (no plot) option carries an empty-string sentinel that maps
// back to null on select. Plot ids are UUIDs and never empty, so nothing
// clashes.
const NONE = '';

// גיליון יצירה/עריכה של משימה, design.md "Task Sheet", כדיאלוג ממורכז
// (Modal) במקום גיליון תחתון, לפי אותה הפרדה שכבר קיימת בין הלקוחות
// לשדות בחירה: תפריט נפתח בווב, שורת צ'יפים בנייד (ראה roadmap.md,
// שלב 2). שם, חלקה, תאריך, בלי עלות: עלות שאלה על "בוצע", לא על
// יצירה, ראה Completion Prompts. בלי כפתורי מצלמה ומיקרופון,
// אלה תלויים בתשתית הקול של שלב 5.
//
// **חלקה אחת למשימה, בבקשת היזם.** הסכימה עדיין מחזיקה `task_plots`
// כטבלת קשר, ולכן `plotIds` נשאר מערך בשכבת הכתיבה, אבל הטופס כותב
// אליו אפס איברים או אחד בדיוק. משימה ישנה שנושאת כמה חלקות תיפתח על
// הראשונה שלה, ושמירה תצמצם אותה לאותה אחת.
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
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'titleRequired' | 'forbidden' | 'error'>(
    'idle',
  );
  const busy = status === 'saving';

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setPlotId(task.plotIds[0] ?? null);
      setDueDate(task.dueDate);
    } else {
      setTitle('');
      setPlotId(defaultPlotId);
      setDueDate(null);
    }
    setStatus('idle');
  }, [open, task, defaultPlotId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!farmId) return;
    setStatus('saving');
    // **`assignedTo` is deliberately absent, not null.** The form no longer asks
    // who is responsible, and an update writes only the fields it is handed, so
    // leaving the key out keeps whatever the row already carries instead of
    // clearing it on every edit.
    const input = {
      title,
      plotIds: plotId ? [plotId] : [],
      dueDate,
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

        {/* בורר החלקה כתפריט נפתח, לפי ההפרדה בין הלקוחות שכבר קיימת
            כאן: תפריט נפתח בווב, קוביות בנייד. רשת הקוביות דחפה את שאר
            הטופס מתחת לקיפול ברגע שיש יותר מארבע חלקות. "כללי" הוא
            ה-null, ראה NONE. */}
        <div className="form__row">
          <label className="form__label" htmlFor="task-plot">
            {t('plots.form.name')}
          </label>
          <select
            id="task-plot"
            className="form__input"
            value={plotId ?? NONE}
            onChange={(e) => setPlotId(e.target.value === NONE ? null : e.target.value)}
            disabled={busy}
          >
            <option value={NONE}>{t('tasks.plotGeneral')}</option>
            {plotsState.plots.map((plot) => (
              <option key={plot.id} value={plot.id}>
                {plot.name}
              </option>
            ))}
          </select>
        </div>

        {/* **שדה אחד, לא שלוש קוביות ואז לוח שנה.** תאריך יעד אינו חובה,
            וריק הוא מצב תקין ולא בחירה שצריך ללחוץ עליה, ולכן אין יותר
            מצב "מתישהו" נפרד: הלוח פתוח, הערך מוצג לידו, ו"נקה תאריך"
            מחזיר אותו לריק.

            **זה המקום היחיד באפליקציה שבו הלוח מסתכל קדימה.** תאריך יעד
            הוא מטרה, ולכן ימים שמאחורי היום אינם לחיצים, חוץ מזה שמשימה
            באיחור כבר נושאת, ש-calendarBounds משאיר לחיץ כדי שעריכה לא
            תתווכח עם הרשומה של עצמה. */}
        <DateField
          id="task-due-date"
          label={t('tasks.form.dueOptional')}
          value={dueDate}
          onChange={setDueDate}
          direction="future"
          shortcuts={false}
          clearLabel={t('tasks.form.dueClear')}
          disabled={busy}
        />

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
