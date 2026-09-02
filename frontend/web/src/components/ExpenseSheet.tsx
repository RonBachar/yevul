import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  attachReceipt,
  createExpense,
  formatLocalDateOnly,
  t,
  updateExpense,
  type Expense,
} from '@yevul/shared';
import { Modal } from './Modal';

// The browser's calendar day, never the UTC one. toISOString() is right for
// most of the day and wrong from local midnight until 02:00 or 03:00, when
// Israel is on a date UTC has not reached yet, so the field would open
// pre-filled with yesterday.
function today(): string {
  return formatLocalDateOnly(new Date());
}

// גיליון יצירה/עריכה של הוצאה בווב, כדיאלוג ממורכז (Modal). ארבעה
// שדות בלבד, בלי שום בחירה, לפי בקשה מפורשת של היזם: "אני לא רוצה
// שיהיו לי אפשרויות, זה מסבך". גרסה קודמת כללה כאן קטגוריה כרשימה
// סגורה וחלקה כתפריט נפתח, לפי design.md, ונדחתה. plotId עדיין נכתב
// (טאב הוצאות בפרטי חלקה עדיין זקוק לו), אבל תמיד משתיקה מ-
// defaultPlotId/expense.plotId, בלי שום בורר שהמשתמש נוגע בו.
export function ExpenseSheet({
  supabase,
  open,
  onClose,
  expense,
  defaultPlotId,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  open: boolean;
  onClose: () => void;
  expense: Expense | null;
  defaultPlotId: string | null;
  farmId: string | null;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [plotId, setPlotId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'amountRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setAmount(String(expense.amount));
      setName(expense.name ?? '');
      setPlotId(expense.plotId);
      setDate(expense.date);
      setNote(expense.note ?? '');
    } else {
      setAmount('');
      setName('');
      setPlotId(defaultPlotId);
      setDate(today());
      setNote('');
    }
    setPickedFile(null);
    setStatus('idle');
  }, [open, expense, defaultPlotId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!farmId || !date) return;
    const amountNumber = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setStatus('amountRequired');
      return;
    }

    setStatus('saving');
    const input = {
      amount: amountNumber,
      name: name.trim() ? name.trim() : null,
      plotId,
      date,
      note: note.trim() ? note.trim() : null,
    };
    const result = expense
      ? await updateExpense(supabase, farmId, expense.id, input)
      : await createExpense(supabase, farmId, input);
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }

    if (pickedFile) {
      await attachReceipt(supabase, farmId, result.id, pickedFile, pickedFile.type || 'image/jpeg');
    }

    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="screen__title">
        {expense ? t('expense.form.titleEdit') : t('expense.form.titleNew')}
      </h2>
      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="form__label" htmlFor="expense-name">
            {t('expense.form.name')}
          </label>
          <input
            id="expense-name"
            className="form__input"
            type="text"
            placeholder={t('expense.form.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="expense-amount">
            {t('expense.form.amount')}
          </label>
          <input
            id="expense-amount"
            className="form__input"
            type="number"
            step="any"
            placeholder={t('common.numberPlaceholder')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="expense-date">
            {t('expense.form.date')}
          </label>
          <input
            id="expense-date"
            className="form__input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="expense-note">
            {t('expense.form.note')} · {t('common.optional')}
          </label>
          <input
            id="expense-note"
            className="form__input"
            type="text"
            placeholder={t('expense.form.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="expense-receipt">
            {t('expense.form.receipt')} · {t('common.optional')}
          </label>
          <input
            id="expense-receipt"
            ref={fileInputRef}
            className="form__input"
            type="file"
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
          />
          {!pickedFile && expense?.receiptPath && (
            <p className="form__message form__message--good">{t('expense.form.receiptAttached')}</p>
          )}
        </div>

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={busy}>
            {busy ? t('expense.saving') : t('expense.save')}
          </button>
          <button type="button" className="form__cancel" onClick={onClose} disabled={busy}>
            {t('plots.detail.back')}
          </button>
          {status === 'amountRequired' && (
            <p className="form__message form__message--bad" role="alert">
              {t('expense.form.amountRequired')}
            </p>
          )}
          {status === 'forbidden' && (
            <p className="form__message form__message--bad" role="alert">
              {t('expense.form.forbidden')}
            </p>
          )}
          {status === 'error' && (
            <p className="form__message form__message--bad" role="alert">
              {t('expense.form.saveError')}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
