import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import Plus from 'lucide-react-native/icons/plus';
import { t, useExpenses, useFarmSettings, type Expense } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { ExpenseRow } from './ExpenseRow';
import { ExpenseSheet } from './ExpenseSheet';

// ההוצאות, שלב ראשון בלבד (ראה packages/shared/src/expenses.ts). רכיב
// תוכן, לא מסך, אותו עיקרון בדיוק כמו JournalList ו-TaskBoard: מרונדר
// גם בטאב כסף (כל המשק) וגם בטאב הוצאות בפרטי חלקה (חלקה אחת), plotId
// מגדיר את ההבדל.
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
    <View style={styles.wrap}>
      <Pressable style={styles.newButton} onPress={openCreate} accessibilityRole="button">
        <Plus size={20} strokeWidth={2.5} color={colors.paper} />
        <Text style={styles.newButtonText}>{t('expense.new')}</Text>
      </Pressable>

      {expensesState.loading && <Text style={styles.note}>{t('common.loading')}</Text>}
      {!expensesState.loading && expensesState.failed && (
        <Text style={formStyles.bad}>{t('expense.loadError')}</Text>
      )}
      {!expensesState.loading && !expensesState.failed && expensesState.expenses.length === 0 && (
        <Text style={styles.note}>{t('expense.empty')}</Text>
      )}

      {!expensesState.loading && !expensesState.failed && expensesState.expenses.length > 0 && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          {expensesState.expenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              plotName={
                showPlotName ? (expensesState.plotNames.get(expense.plotId ?? '') ?? null) : null
              }
              currency={currency}
              onPress={() => openEdit(expense)}
            />
          ))}
        </ScrollView>
      )}

      <ExpenseSheet
        supabase={supabase}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        expense={editingExpense}
        defaultPlotId={plotId ?? null}
        farmId={expensesState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          expensesState.refresh();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: spacing.s16,
  },
  newButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s20,
    borderRadius: radius.pill,
    backgroundColor: colors.field700,
  },
  newButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.paper,
  },
  scroll: {
    flex: 1,
  },
  rows: {
    gap: spacing.s8,
    paddingBottom: spacing.s24,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
});
