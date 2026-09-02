import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Receipt from 'lucide-react-native/icons/receipt';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { formatAmount, t, type Currency, type Expense } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { ConfirmDialog } from './ConfirmDialog';

const ACTION_SIZE = 48;

// אטום ההוצאות. אייקון ניטרלי אחד לכל השורות (בלי מיפוי קטגוריה→
// צבע, שהוסר לפי בקשת היזם לפשט את הטופס וכל מה שסביבו). כותרת
// השורה היא שם ההוצאה שהוקלד, ובלעדיו תווית גנרית.
//
// **The delete button sits exactly where TaskRow's does**, same Trash2, same
// Loss-600 pill, same 48, so a farmer who has deleted a task finds it without
// being taught. There is no swipe here because this row has never had one, and
// no undo toast because deletion in this product does not use one: TaskRow
// spends its undo on "בוצע" and guards deletion with a confirmation *before*
// the write, which is the safer half of the pair for a record that is money.
//
// **The confirmation names the amount, not only the name.** A task is
// identified by its title; an expense a farmer is about to destroy is
// identified by how much it was, and half of these rows have no name at all.
export function ExpenseRow({
  expense,
  plotName,
  currency,
  onPress,
  onDeleteCommit,
}: {
  expense: Expense;
  plotName: string | null;
  currency: Currency;
  onPress: () => void;
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
    <View style={styles.row}>
      <Pressable style={styles.body} onPress={onPress} accessibilityRole="button">
        <View style={styles.iconDot}>
          <Receipt size={20} strokeWidth={2} color={colors.slate600} />
          {expense.receiptPath && <View style={styles.receiptDot} />}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
        </View>
        <Text style={styles.amount} numberOfLines={1}>
          {amountLabel}
        </Text>
      </Pressable>
      <Pressable
        style={styles.deleteButton}
        onPress={() => setConfirmingDelete(true)}
        accessibilityRole="button"
        accessibilityLabel={t('expense.action.delete')}
      >
        <Trash2 size={20} color={colors.paper} strokeWidth={2.5} />
      </Pressable>
      <ConfirmDialog
        visible={confirmingDelete}
        title={t('expense.deleteConfirmTitle')}
        message={`${title} · ${amountLabel}`}
        confirmLabel={t('expense.action.delete')}
        cancelLabel={t('expense.action.cancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    gap: spacing.s8,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
  },
  iconDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mist200,
    position: 'relative',
  },
  receiptDot: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.field700,
  },
  text: {
    flex: 1,
    gap: spacing.s4,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodyLg,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
  },
  // 48 ולא 56, אותו נימוק בדיוק כמו ב-TaskRow: זה כפתור בתוך שורה
  // שרובה כבר אזור מגע לפעולה אחרת, ולא נקודת הכניסה היחידה לפעולה.
  deleteButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.loss600,
  },
});
