import { useState } from 'react';
import { Receipt, Trash2 } from 'lucide-react';
import { formatAmount, t, type Currency, type Expense } from '@yevul/shared';
import { ConfirmDialog } from './ConfirmDialog';
import './ExpenseRow.css';

// אטום ההוצאות בווב. אייקון ניטרלי אחד לכל השורות (בלי מיפוי קטגוריה→
// צבע, שהוסר לפי בקשת היזם לפשט את הטופס וכל מה שסביבו). כותרת
// השורה היא שם ההוצאה שהוקלד, ובלעדיו תווית גנרית.
//
// **The delete button sits exactly where TaskRow's does**, same Trash2, same
// Loss-600 pill, and it is confirmed through the same ConfirmDialog before the
// write rather than undone after it. That also settles the markup: the whole
// row used to be one <button>, and a button cannot be nested in a button, so
// the row is now a container with a button for the body — TaskRow's shape.
//
// **The confirmation names the amount, not only the name.** A task is
// identified by its title; an expense a farmer is about to destroy is
// identified by how much it was, and half of these rows have no name at all.
export function ExpenseRow({
  expense,
  plotName,
  currency,
  onEdit,
  onDeleteCommit,
}: {
  expense: Expense;
  plotName: string | null;
  currency: Currency;
  onEdit: () => void;
  onDeleteCommit: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dateLabel = new Date(expense.date).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
  });
  const metaParts = [plotName ?? t('tasks.plotGeneral'), dateLabel];
  const title = expense.name ?? t('expense.row.unnamed');
  const amountLabel = formatAmount(expense.amount, currency);

  function confirmDelete() {
    setConfirmingDelete(false);
    onDeleteCommit();
  }

  return (
    <div className="expense-row">
      <button type="button" className="expense-row__body" onClick={onEdit}>
        <span className="expense-row__icon">
          <Receipt size={20} strokeWidth={2} aria-hidden="true" />
          {expense.receiptPath && <span className="expense-row__receipt-dot" aria-hidden="true" />}
        </span>
        <span className="expense-row__text">
          <span className="expense-row__title">{title}</span>
          <span className="expense-row__meta">{metaParts.join(' · ')}</span>
        </span>
        <span className="expense-row__amount">{amountLabel}</span>
      </button>
      <button
        type="button"
        className="expense-row__delete"
        onClick={() => setConfirmingDelete(true)}
        aria-label={t('expense.action.delete')}
      >
        <Trash2 size={18} strokeWidth={2.5} />
      </button>
      <ConfirmDialog
        open={confirmingDelete}
        title={t('expense.deleteConfirmTitle')}
        message={`${title} · ${amountLabel}`}
        confirmLabel={t('expense.action.delete')}
        cancelLabel={t('expense.action.cancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
