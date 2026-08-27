import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { t, useExpenses, useFarmSettings, type Expense } from '@yevul/shared';
import { ExpenseRow } from './ExpenseRow';
import { ExpenseSheet } from './ExpenseSheet';
import './ExpenseList.css';

// ההוצאות בווב, שלב ראשון בלבד (ראה packages/shared/src/expenses.ts).
// רכיב תוכן, לא מסך, אותו עיקרון בדיוק כמו JournalList: מרונדר גם
// בטאב כסף (כל המשק) וגם בטאב הוצאות בפרטי חלקה (חלקה אחת).
export function ExpenseList({
  supabase,
  plotId,
  showPlotName,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
}) {
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';
  const expensesState = useExpenses(supabase, plotId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  function openCreate() {
    setEditingExpense(null);
    setSheetOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setSheetOpen(true);
  }

  return (
    <div className="expense-list">
      <button type="button" className="form__submit expense-list__new" onClick={openCreate}>
        {t('expense.new')}
      </button>

      {expensesState.loading && <p className="screen__note">{t('common.loading')}</p>}
      {!expensesState.loading && expensesState.failed && (
        <p className="form__message form__message--bad" role="alert">
          {t('expense.loadError')}
        </p>
      )}
      {!expensesState.loading && !expensesState.failed && expensesState.expenses.length === 0 && (
        <p className="screen__note">{t('expense.empty')}</p>
      )}

      {!expensesState.loading && !expensesState.failed && expensesState.expenses.length > 0 && (
        <div className="expense-list__rows">
          {expensesState.expenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              plotName={
                showPlotName ? (expensesState.plotNames.get(expense.plotId ?? '') ?? null) : null
              }
              currency={currency}
              onEdit={() => openEdit(expense)}
            />
          ))}
        </div>
      )}

      <ExpenseSheet
        supabase={supabase}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        expense={editingExpense}
        defaultPlotId={plotId ?? null}
        farmId={expensesState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          expensesState.refresh();
        }}
      />
    </div>
  );
}
