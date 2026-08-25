import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createTask,
  currencySymbol,
  t,
  taskCostMemory,
  updateTask,
  usePlots,
  type Currency,
  type Task,
} from '@yevul/shared';
import { Modal } from './Modal';

type DueMode = 'someday' | 'week' | 'date';

function computeDueDate(mode: DueMode, customDate: string, now: Date): string | null {
  if (mode === 'someday') return null;
  if (mode === 'week') {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  return customDate || null;
}

// גיליון יצירה/עריכה של משימה, design.md "Task Sheet", כדיאלוג ממורכז
// (Modal) במקום גיליון תחתון, לפי אותה הפרדה שכבר קיימת בין הלקוחות
// לשדות בחירה: תפריט נפתח בווב, שורת צ'יפים בנייד (ראה roadmap.md,
// שלב 2). בלי כפתורי מצלמה ומיקרופון, אלה תלויים בתשתית הקול של שלב 5.
export function TaskSheet({
  supabase,
  open,
  onClose,
  task,
  defaultPlotId,
  farmId,
  currency,
  onSaved,
}: {
  supabase: SupabaseClient;
  open: boolean;
  onClose: () => void;
  task: Task | null;
  defaultPlotId: string | null;
  farmId: string | null;
  currency: Currency;
  onSaved: () => void;
}) {
  const plotsState = usePlots(supabase);

  const [title, setTitle] = useState('');
  const [plotId, setPlotId] = useState<string | null>(null);
  const [dueMode, setDueMode] = useState<DueMode>('someday');
  const [customDate, setCustomDate] = useState('');
  const [costText, setCostText] = useState('');
  // "touched" נדבק ברגע שהמשתמש נוגע בשדה העלות בעצמו, ומאותו רגע
  // חיפוש הזיכרון מפסיק לגעת בשדה, גם אם הכותרת ממשיכה להשתנות. משימה
  // בעריכה עם עלות שמורה מתחילה touched, כדי שעריכת הכותרת לא תדרוס
  // ערך אמיתי בניחוש מהזיכרון.
  const [costTouched, setCostTouched] = useState(false);
  // "prefilled" שולט רק בצבע, design.md: "Pre-filled values render in
  // Slate-600 until touched, then Ink-900, the farmer can see at a
  // glance that this is a remembered number and not something he
  // entered today."
  const [costPrefilled, setCostPrefilled] = useState(false);
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
        setCustomDate('');
      }
      setCostText(task.estimatedCost != null ? String(task.estimatedCost) : '');
      setCostTouched(task.estimatedCost != null);
    } else {
      setTitle('');
      setPlotId(defaultPlotId);
      setDueMode('someday');
      setCustomDate('');
      setCostText('');
      setCostTouched(false);
    }
    setCostPrefilled(false);
    setStatus('idle');
  }, [open, task, defaultPlotId]);

  // TaskCostMemory, prd.md: "בפעם הבאה שהוא פותח משימה עם אותה כותרת
  // השדה כבר מלא במה שרשם קודם". דחייה של 400ms כדי לא לשלוח שאילתה
  // על כל תו, ונעצר לגמרי אחרי שהמשתמש נגע בשדה העלות בעצמו.
  useEffect(() => {
    if (!open || !farmId || costTouched) return;
    if (!title.trim()) {
      setCostText('');
      setCostPrefilled(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void taskCostMemory(supabase, farmId, title).then((cost) => {
        if (!active) return;
        setCostText(cost != null ? String(cost) : '');
        setCostPrefilled(cost != null);
      });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, farmId, title, costTouched, supabase]);

  function onCostChange(value: string) {
    setCostText(value);
    setCostTouched(true);
    setCostPrefilled(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!farmId) return;
    setStatus('saving');
    const costTrimmed = costText.trim();
    const cost = costTrimmed === '' ? null : Number(costTrimmed.replace(',', '.'));
    const input = {
      title,
      plotId,
      dueDate: computeDueDate(dueMode, customDate, new Date()),
      estimatedCost: cost != null && Number.isFinite(cost) ? cost : null,
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
          {dueMode === 'date' && (
            <input
              className="form__input"
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              disabled={busy}
            />
          )}
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="task-cost">
            {t('tasks.form.cost')}
            <span className="form__label-unit"> · {currencySymbol(currency)}</span>
          </label>
          <input
            id="task-cost"
            className={costPrefilled ? 'form__input form__input--prefilled' : 'form__input'}
            type="number"
            step="any"
            placeholder={t('common.optional')}
            value={costText}
            onChange={(e) => onCostChange(e.target.value)}
            disabled={busy}
          />
        </div>

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
