import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import Plus from 'lucide-react-native/icons/plus';
import { deleteExpense, t, useExpenses, useFarmSettings, type Expense } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { ExpenseRow } from './ExpenseRow';
import { ExpenseSheet } from './ExpenseSheet';
import { ListStateNote } from './ListStateNote';

// ההוצאות, שלב ראשון בלבד (ראה packages/shared/src/expenses.ts). רכיב
// תוכן, לא מסך, אותו עיקרון בדיוק כמו JournalList ו-TaskBoard: מרונדר
// גם בטאב כסף (כל המשק) וגם בטאב הוצאות בפרטי חלקה (חלקה אחת), plotId
// מגדיר את ההבדל.
//
// **FlatList and not ScrollView.** A farm's expenses have no ceiling, and a
// ScrollView mounts every row it is given at once. The button stays outside
// the list, pinned where it has always been; only the rows scroll.
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
  const refreshControl = usePullToRefresh([expensesState]);
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

  // Exactly TaskBoard's handleDelete: write, then reload. The row confirmed
  // with the farmer before calling this, so there is nothing left to ask.
  async function handleDelete(expenseId: string) {
    await deleteExpense(supabase, expenseId);
    expensesState.refresh();
  }

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.newButton} onPress={openCreate} accessibilityRole="button">
        <Plus size={20} strokeWidth={2.5} color={colors.paper} />
        <Text style={styles.newButtonText}>{t('expense.new')}</Text>
      </Pressable>

      <FlatList<Expense>
        // Exactly the condition the rows were rendered under before the
        // conversion: a failed load keeps the rows it had, and showing them
        // under an error message would claim they are current.
        data={expensesState.loading || expensesState.failed ? [] : expensesState.expenses}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.rows}
        refreshControl={refreshControl}
        ItemSeparatorComponent={RowGap}
        renderItem={({ item }) => (
          <ExpenseRow
            expense={item}
            plotName={
              showPlotName ? (expensesState.plotNames.get(item.plotId ?? '') ?? null) : null
            }
            currency={currency}
            onPress={() => openEdit(item)}
            onDeleteCommit={() => handleDelete(item.id)}
          />
        )}
        // Wrapped in a View because FlatList clones this element to attach
        // style and onLayout, and both need a host component to land on.
        ListEmptyComponent={
          <View>
            <ListStateNote
              loading={expensesState.loading}
              failed={expensesState.failed}
              errorKey="expense.loadError"
              emptyKey="expense.empty"
            />
          </View>
        }
      />

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

// A separator and not `gap` on the content container. Virtualization swaps
// off-screen rows for spacer views, and a gap would be added around those too.
function RowGap() {
  return <View style={styles.rowGap} />;
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
  // flexGrow so the empty state fills the space left over. Without it a list
  // with no rows has no height, and on Android there is nothing to pull.
  rows: {
    flexGrow: 1,
    paddingBottom: spacing.s24,
  },
  rowGap: {
    height: spacing.s8,
  },
});
