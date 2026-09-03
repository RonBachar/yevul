import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  attachReceipt,
  createExpense,
  expenseDraftFromExpense,
  expenseNameOptions,
  expenseWriteInput,
  formatLocalDateOnly,
  newExpenseDraft,
  t,
  updateExpense,
  useExpenseSuggestions,
  type Expense,
  type ExpenseDraft,
} from '@yevul/shared';
import { DateField } from './DateField';
import { Modal } from './Modal';
import { ReceiptViewer } from './ReceiptViewer';
import { TilePicker } from './TilePicker';

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
//
// The browser half of frontend/mobile/src/components/ExpenseSheet.tsx, and both
// clients get the pattern in the same change, exactly as the plot form did.
//
// **The third screen on the tile pattern, and the first that stayed one form.**
// An expense is the highest-frequency action in the product, so the taps were
// counted before the shape was chosen rather than after: a stepped walk costs
// more clicks than the form it would replace, and costs the most on a receipt
// found later, which is the common case here. The counts, and the field-by-field
// reasoning for which answer became squares, are in
// packages/shared/src/expenseForm.ts. What changed on this screen is one field:
// the expense **name** is now a grid fed by the farm's own history, and the
// amount, the note and the calendar are exactly what they were.
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
  // The whole form as one value: name, the amount box's text, the inferred
  // plot, the date and the note. See ExpenseDraft.
  const [draft, setDraft] = useState<ExpenseDraft>(() => newExpenseDraft(new Date(), null));
  // Whether the "new name" square has opened its box. The box writes straight
  // into draft.name, so there is no second state to keep in step.
  const [adding, setAdding] = useState(false);
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

  // The name grid, out of this farm's own expenses. Re-read every time the
  // dialog opens rather than once on mount: ExpenseList keeps this component
  // mounted behind a closed Modal, and a grid missing the name he entered an
  // hour ago is a grid that sends him back to the keyboard.
  const suggestions = useExpenseSuggestions(supabase, farmId, open);
  // **The held value is dropped out of the grid while the box is open**, so that
  // typing a new name cannot push a square in or out of the grid above the box.
  const nameOptions = expenseNameOptions(suggestions.names, adding ? null : draft.name);
  const selectedName = adding || draft.name.trim() === '' ? null : draft.name.trim();

  useEffect(() => {
    if (!open) return;
    setDraft(
      expense ? expenseDraftFromExpense(expense) : newExpenseDraft(new Date(), defaultPlotId),
    );
    setAdding(false);
    setPickedFile(null);
    setViewing(false);
    setStatus('idle');
  }, [open, expense, defaultPlotId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!farmId || !draft.date) return;
    // The one thing that can stop the save, and it is returned by the builder
    // rather than checked beside it, so the write cannot be assembled without an
    // amount. See expenseWriteInput.
    const input = expenseWriteInput(draft);
    if (!input) {
      setStatus('amountRequired');
      return;
    }

    setStatus('saving');
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
          onBack={() => {
            setViewing(false);
            // The add-a-name box is the one autofocusing field on this form and
            // coming back from the viewer remounts it. Closed here so that
            // looking at a receipt does not end in a focused text box.
            setAdding(false);
          }}
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
        {/* The one field on this form with a vocabulary that repeats: a farm
            buys diesel, fertiliser and pesticide over and over. The grid fills
            up from the farm's own history, which is the case
            useSpraySuggestions established and useCropSuggestions repeated. */}
        <TilePicker
          id="expense-step-name"
          title={t('expense.form.step.name')}
          options={nameOptions.map((value) => ({ value, label: value }))}
          selectedValue={selectedName}
          onSelect={(value) => {
            setDraft((current) => ({ ...current, name: value }));
            setAdding(false);
          }}
          actions={[
            { key: 'add', label: t('expense.form.addName'), onPress: () => setAdding(true) },
          ]}
          // The first expense on a new account lands here with an empty grid.
          // The sentence plus the dashed square is what keeps that from reading
          // as a broken screen.
          emptyHint={t('expense.form.emptyNames')}
          disabled={busy}
          footer={
            adding ? (
              <div className="tile-picker__footer">
                {/* Bound straight to the draft, with no confirm button under it:
                    there is no next step to advance to on a form, so a button
                    whose only job was to close the box would be a click charged
                    for nothing. */}
                <input
                  id="expense-name"
                  className="form__input"
                  type="text"
                  placeholder={t('expense.form.namePlaceholder')}
                  value={draft.name}
                  onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                  disabled={busy}
                  aria-labelledby="expense-step-name"
                  autoFocus
                />
              </div>
            ) : null
          }
        />

        <div className="form__row">
          <label className="form__label" htmlFor="expense-amount">
            {t('expense.form.amount')}
          </label>
          {/* **Typed and never a square, deliberately.** Every profit figure the
              product shows is summed from expenses.amount, and amounts do not
              repeat the way names do. Same refusal the plot form made for a
              plot's area, and for the same reason. */}
          <input
            id="expense-amount"
            className="form__input"
            type="number"
            step="any"
            placeholder={t('common.numberPlaceholder')}
            value={draft.amountText}
            onChange={(e) => setDraft((current) => ({ ...current, amountText: e.target.value }))}
            disabled={busy}
          />
        </div>

        {/* An expense records money already spent, so the calendar stops at
            today. What was here was a native date input -- better than the two
            number boxes the phone had, still a text box with a popup that
            differs by browser. Both clients now ask the same way. */}
        <DateField
          id="expense-date"
          label={t('expense.form.date')}
          value={draft.date}
          onChange={(next) => setDraft((current) => ({ ...current, date: next ?? today() }))}
          direction="past"
          // **No today/yesterday shortcuts here, by the founder's decision
          // 2026-09-03.** They are right on a spray, which is logged the same
          // evening or the next morning, and wrong on an expense, which is
          // usually a receipt found later. His words: "they just complicate it,
          // options that dull the experience -- I only want to pick a date from
          // a calendar." When a receipt is photographed the model reads the
          // date off it and he is not asked at all, which is the real shortcut.
          shortcuts={false}
          disabled={busy}
        />

        <div className="form__row">
          <label className="form__label" htmlFor="expense-note">
            {t('expense.form.note')} · {t('common.optional')}
          </label>
          {/* Free text and optional. A note is by definition the one-off thing
              worth saying about this expense, so there is no history to make a
              grid out of. */}
          <input
            id="expense-note"
            className="form__input"
            type="text"
            placeholder={t('expense.form.notePlaceholder')}
            value={draft.note}
            onChange={(e) => setDraft((current) => ({ ...current, note: e.target.value }))}
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
