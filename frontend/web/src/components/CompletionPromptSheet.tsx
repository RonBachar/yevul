import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle } from 'lucide-react';
import {
  confirmExpenseFromTask,
  confirmJournalFromTask,
  t,
  taskCostMemory,
  usePlots,
  type Currency,
  type Task,
} from '@yevul/shared';
import { Modal } from './Modal';
import './CompletionPromptSheet.css';

const AUTO_DISMISS_MS = 8000;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Completion Prompts, design.md. שתי הצעות עצמאיות אחרי סימון משימה
// כבוצעה: לשמור ביומן, ולרשום כהוצאה. "Offering, never doing".
//
// אין ניחוש סוג יומן מתוך כותרת המשימה, ראה completionPrompts.ts.
// שאלת ההוצאה תמיד נשאלת (בכפוף למתג בהגדרות), לא מותנית ב"עלות
// משוערת" של המשימה, כי השדה הזה הוסר מ-TaskSheet. הסכום המוצע מגיע
// מ-TaskCostMemory לפי הכותרת המנורמלת.
export function CompletionPromptSheet({
  supabase,
  open,
  task,
  farmId,
  currency,
  journalEnabled,
  expenseEnabled,
  onClose,
}: {
  supabase: SupabaseClient;
  open: boolean;
  task: Pick<Task, 'id' | 'title' | 'plotId'> | null;
  farmId: string | null;
  currency: Currency;
  journalEnabled: boolean;
  expenseEnabled: boolean;
  onClose: () => void;
}) {
  const plotsState = usePlots(supabase);

  const [journalStatus, setJournalStatus] = useState<
    'idle' | 'saving' | 'saved' | 'declined' | 'error'
  >('idle');
  const [expenseAnswered, setExpenseAnswered] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePlotId, setExpensePlotId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(today());
  const [expenseStatus, setExpenseStatus] = useState<
    'idle' | 'saving' | 'saved' | 'declined' | 'forbidden' | 'error'
  >('idle');

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearDismissTimer() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }

  useEffect(() => {
    if (!open || !task) return;
    setJournalStatus('idle');
    setExpenseAnswered(false);
    setExpenseAmount('');
    setExpensePlotId(task.plotId);
    setExpenseDate(today());
    setExpenseStatus('idle');

    if (expenseEnabled && farmId) {
      void taskCostMemory(supabase, farmId, task.title).then((amount) => {
        if (amount != null) setExpenseAmount(String(amount));
      });
    }

    dismissTimer.current = setTimeout(onClose, AUTO_DISMISS_MS);
    return clearDismissTimer;
    // תלוי רק ב-open ובזהות המשימה, לא בשאר הפרופים, כדי שרינדור מחדש
    // של TaskBoard לא יאפס את הגיליון באמצע אינטראקציה.
  }, [open, task?.id]);

  if (!open || !task) return null;

  async function onJournalAnswer(yes: boolean) {
    clearDismissTimer();
    if (!yes) {
      setJournalStatus('declined');
      return;
    }
    if (!farmId || !task) return;
    setJournalStatus('saving');
    const result = await confirmJournalFromTask(supabase, farmId, task);
    setJournalStatus(result.ok ? 'saved' : 'error');
  }

  function onExpenseYes() {
    clearDismissTimer();
    setExpenseAnswered(true);
  }

  function onExpenseNo() {
    clearDismissTimer();
    setExpenseStatus('declined');
  }

  async function onExpenseConfirm() {
    if (!farmId || !task) return;
    const amount = Number(expenseAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return;

    setExpenseStatus('saving');
    const result = await confirmExpenseFromTask(supabase, farmId, task, {
      amount,
      name: task.title,
      plotId: expensePlotId,
      date: expenseDate,
      note: null,
    });
    setExpenseStatus(result.ok ? 'saved' : result.reason);
  }

  const journalDone =
    journalStatus === 'saved' || journalStatus === 'declined' || journalStatus === 'error';
  const expenseDone =
    expenseStatus === 'saved' ||
    expenseStatus === 'declined' ||
    expenseStatus === 'forbidden' ||
    expenseStatus === 'error';
  const allDone = (!journalEnabled || journalDone) && (!expenseEnabled || expenseDone);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="completion-prompt__header">
        <CheckCircle size={28} strokeWidth={2} color="var(--color-field-700)" aria-hidden="true" />
        <p className="completion-prompt__title">
          {t('completion.donePrefix')}: {task.title}
        </p>
      </div>

      {journalEnabled && (
        <div className="completion-prompt__question">
          <p className="completion-prompt__question-text">{t('completion.saveToJournal')}</p>
          {journalStatus === 'idle' ? (
            <div className="completion-prompt__answers">
              <button
                type="button"
                className="completion-prompt__answer"
                onClick={() => onJournalAnswer(true)}
              >
                {t('completion.yes')}
              </button>
              <button
                type="button"
                className="completion-prompt__answer"
                onClick={() => onJournalAnswer(false)}
              >
                {t('completion.no')}
              </button>
            </div>
          ) : journalStatus === 'saving' ? (
            <p className="screen__note">{t('log.saving')}</p>
          ) : journalStatus === 'saved' ? (
            <p className="form__message form__message--good">{t('completion.journalSaved')}</p>
          ) : journalStatus === 'declined' ? (
            <p className="screen__note">{t('completion.declined')}</p>
          ) : (
            <p className="form__message form__message--bad">{t('completion.error')}</p>
          )}
        </div>
      )}

      {expenseEnabled && (
        <div className="completion-prompt__question">
          <p className="completion-prompt__question-text">{t('completion.recordAsExpense')}</p>
          {!expenseAnswered && !expenseDone && (
            <div className="completion-prompt__answers">
              <button type="button" className="completion-prompt__answer" onClick={onExpenseYes}>
                {t('completion.yes')}
              </button>
              <button type="button" className="completion-prompt__answer" onClick={onExpenseNo}>
                {t('completion.no')}
              </button>
            </div>
          )}

          {expenseAnswered && !expenseDone && (
            <div className="form">
              <div className="form__row">
                <label className="form__label" htmlFor="completion-expense-amount">
                  {t('completion.expenseAmount')} ({currency})
                </label>
                <input
                  id="completion-expense-amount"
                  className="form__input"
                  type="number"
                  step="any"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  disabled={expenseStatus === 'saving'}
                  autoFocus
                />
              </div>

              <div className="form__row">
                <label className="form__label" htmlFor="completion-expense-plot">
                  {t('plots.form.name')}
                </label>
                <select
                  id="completion-expense-plot"
                  className="form__input"
                  value={expensePlotId ?? ''}
                  onChange={(e) => setExpensePlotId(e.target.value === '' ? null : e.target.value)}
                  disabled={expenseStatus === 'saving' || plotsState.loading}
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
                <label className="form__label" htmlFor="completion-expense-date">
                  {t('log.form.date')}
                </label>
                <input
                  id="completion-expense-date"
                  className="form__input"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  disabled={expenseStatus === 'saving'}
                />
              </div>

              <div className="form__actions">
                <button
                  type="button"
                  className="form__submit"
                  onClick={onExpenseConfirm}
                  disabled={expenseStatus === 'saving'}
                >
                  {expenseStatus === 'saving' ? t('log.saving') : t('completion.expenseConfirm')}
                </button>
              </div>
            </div>
          )}

          {expenseStatus === 'saved' && (
            <p className="form__message form__message--good">{t('completion.expenseSaved')}</p>
          )}
          {expenseStatus === 'declined' && (
            <p className="screen__note">{t('completion.declined')}</p>
          )}
          {expenseStatus === 'forbidden' && (
            <p className="form__message form__message--bad">{t('completion.forbidden')}</p>
          )}
          {expenseStatus === 'error' && (
            <p className="form__message form__message--bad">{t('completion.error')}</p>
          )}
        </div>
      )}

      {allDone && (
        <button type="button" className="form__submit" onClick={onClose}>
          {t('capture.close')}
        </button>
      )}
    </Modal>
  );
}
