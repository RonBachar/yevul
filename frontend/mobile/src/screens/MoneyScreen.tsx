import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { ExpenseList } from '../components/ExpenseList';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/tokens';

// טאב הכסף, מאחד את מה שהיה הנהלת חשבונות ודוחות, design.md: "Merges
// what used to be separate Ledger and Reports destinations". שלב 3
// בונה כאן רק את רשימת ההוצאות (הקצאה יחידה, בלי פיצול/הוצאה קבועה/
// קבלה, ראה packages/shared/src/expenses.ts). קבלות וייצוא דוחות
// שייכים לשלב 4, לפי הרודמאפ.
export function MoneyScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.body}>
        <ExpenseList supabase={supabase} showPlotName />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  body: {
    flex: 1,
    padding: spacing.s24,
  },
});
