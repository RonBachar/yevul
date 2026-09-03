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
import { DateField } from './DateField';
import { Modal } from './Modal';
import { ReceiptViewer } from './ReceiptViewer';

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
  // The viewer replaces the form's dialog rather than stacking a second one over
  // it. Two open Modals would both be listening for Escape, and one key press
  // would close the document *and* the half-filled form behind it.
  const [viewing, setViewing] = useState(false);
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
    setViewing(false);
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

  // **The document takes the dialog over, and gets a wider one.** A receipt
  // rendered inside a 480px form column is a receipt nobody can read, and the
  // browser is where the accountant does this work. This component stays
  // mounted throughout, so the form is exactly where he left it on the way back.
  if (viewing && expense) {
    return (
      <Modal open={open} onClose={onClose} wide>
        <ReceiptViewer
          supabase={supabase}
          expenseId={expense.id}
          onBack={() => setViewing(false)}
        />
      </Modal>
    );
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

        {/* An expense records money already spent, so the calendar stops at
            today and the three shortcuts point backwards. What was here was a
            native date input -- better than the two number boxes the phone had,
            still a text box with a popup that differs by browser. Both clients
            now ask the same way. */}
        <DateField
          id="expense-date"
          label={t('expense.form.date')}
          value={date}
          onChange={(next) => setDate(next ?? today())}
          direction="past"
          disabled={busy}
        />

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
          {/* **Driven by expense.receiptPath, which useExpenses already
              selected**, so the button costs no request and the dialog asks
              storage for nothing until he clicks it. Offered even when a
              replacement file has been chosen: what it opens is what is
              actually filed, and the chosen file is not filed until he saves. */}
          {expense?.receiptPath && (
            <div className="form__actions">
              <button
                type="button"
                className="form__cancel"
                onClick={() => setViewing(true)}
                disabled={busy}
              >
                {t('expense.form.receiptView')}
              </button>
            </div>
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
