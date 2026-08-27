import { Receipt } from 'lucide-react';
import { formatAmount, t, type Currency, type Expense } from '@yevul/shared';
import './ExpenseRow.css';

// אטום ההוצאות בווב. אייקון ניטרלי אחד לכל השורות (בלי מיפוי קטגוריה→
// צבע, שהוסר לפי בקשת היזם לפשט את הטופס וכל מה שסביבו). כותרת
// השורה היא שם ההוצאה שהוקלד, ובלעדיו תווית גנרית.
export function ExpenseRow({
  expense,
  plotName,
  currency,
  onEdit,
}: {
  expense: Expense;
  plotName: string | null;
  currency: Currency;
  onEdit: () => void;
}) {
  const dateLabel = new Date(expense.date).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
  });
  const metaParts = [plotName ?? t('tasks.plotGeneral'), dateLabel];

  return (
    <button type="button" className="expense-row" onClick={onEdit}>
      <span className="expense-row__icon">
        <Receipt size={20} strokeWidth={2} aria-hidden="true" />
        {expense.receiptPath && <span className="expense-row__receipt-dot" aria-hidden="true" />}
      </span>
      <span className="expense-row__body">
        <span className="expense-row__title">{expense.name ?? t('expense.row.unnamed')}</span>
        <span className="expense-row__meta">{metaParts.join(' · ')}</span>
      </span>
      <span className="expense-row__amount">{formatAmount(expense.amount, currency)}</span>
    </button>
  );
}
