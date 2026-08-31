import { useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { t, useExpenses, useFarmSettings, type Expense } from '@yevul/shared';
import { ExpenseRow } from './ExpenseRow';
import { ExpenseSheet } from './ExpenseSheet';
import './ExpenseList.css';

// ההוצאות בווב, שלב ראשון בלבד (ראה packages/shared/src/expenses.ts).
// רכיב תוכן, לא מסך, אותו עיקרון בדיוק כמו JournalList: מרונדר גם
// בטאב כסף (כל המשק) וגם בטאב הוצאות בפרטי חלקה (חלקה אחת).
// renderAside מקבל את המצב **שכבר נטען כאן** ומרנדר מעליו. זה קיים
// כדי שמסך הכסף יוכל לתלות סרגל ייצוא על אותם נתונים בלי לקרוא
// ל-useExpenses בעצמו: הגרסה הראשונה עשתה בדיוק את זה, והתוצאה הייתה
// שלוש שאילתות הוצאות זהות בכל טעינת המסך. נמצא בקוד ריוויו של שלב 4.
export function ExpenseList({
  supabase,
  plotId,
  showPlotName,
  renderAside,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
  renderAside?: (state: {
    expenses: Expense[];
    plotNames: Map<string, string>;
    loading: boolean;
  }) => ReactNode;
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

  const list = (
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

  // בלי aside אין מה לפרוס, והרשימה חוזרת כמו שהיא. עם aside, מ-1024
  // ומעלה הם יושבים זה לצד זה במקום זה מעל זה. ראה .layout-rail
  // ב-shell.css.
  if (!renderAside) return list;

  return (
    <div className="layout-rail">
      {list}
      <aside className="layout-rail__aside">
        {renderAside({
          expenses: expensesState.expenses,
          plotNames: expensesState.plotNames,
          loading: expensesState.loading,
        })}
      </aside>
    </div>
  );
}
