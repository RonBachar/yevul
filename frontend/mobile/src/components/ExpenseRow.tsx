import { Pressable, StyleSheet, Text, View } from 'react-native';
import Receipt from 'lucide-react-native/icons/receipt';
import { formatAmount, t, type Currency, type Expense } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';


// אטום ההוצאות. אייקון ניטרלי אחד לכל השורות (בלי מיפוי קטגוריה→
// צבע, שהוסר לפי בקשת היזם לפשט את הטופס וכל מה שסביבו). כותרת
// השורה היא שם ההוצאה שהוקלד, ובלעדיו תווית גנרית.
export function ExpenseRow({
  expense,
  plotName,
  currency,
  onPress,
}: {
  expense: Expense;
  plotName: string | null;
  currency: Currency;
  onPress: () => void;
}) {
  const dateLabel = new Date(expense.date).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
  });
  const metaParts = [plotName ?? t('tasks.plotGeneral'), dateLabel];

  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={styles.iconDot}>
        <Receipt size={20} strokeWidth={2} color={colors.slate600} />
        {expense.receiptPath && <View style={styles.receiptDot} />}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {expense.name ?? t('expense.row.unnamed')}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {metaParts.join(' · ')}
        </Text>
      </View>
      <Text style={styles.amount} numberOfLines={1}>
        {formatAmount(expense.amount, currency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    gap: spacing.s12,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
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
  body: {
    flex: 1,
    gap: spacing.s4,
  },
  title: {
    fontFamily: fonts.medium,
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
});
