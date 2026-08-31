import { Pressable, StyleSheet, Text, View } from 'react-native';
import Wallet from 'lucide-react-native/icons/wallet';
import ListChecks from 'lucide-react-native/icons/list-checks';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import { t } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { useCaptureActions } from '../navigation/CaptureActions';

// שלושה קיצורי דרך מתחת לכרטיס הרווח, בהחלטת היזם 2026-08-31.
//
// **הם חוסכים לחיצה אמיתית ולא רק מקצרים מרחק.** רישום הוצאה דרש
// לחיצה על כפתור הרישום המרכזי, בחירה מתוך גיליון בן שלוש שורות, ואז
// מילוי. כאן זו לחיצה אחת ישר לטופס. הערכת היזם על המצב הקודם הייתה
// "יותר מדי לחיצות".
//
// **כל אחד נושא את צבע התחום שלו**, לפי הפלטה החדשה: כסף ירוק,
// משימות כחול, יומן סגול. זה מה שנותן לעין ללמוד את המוצר, וזו גם
// הפעם הראשונה שהכחול והסגול מופיעים במסך הבית.
//
// אין כאן מקבילה בווב במכוון: בדפדפן סרגל הצד גלוי תמיד, ושלושה
// כפתורים שמשכפלים אותו הם רעש ולא קיצור.

const ACTIONS = [
  {
    key: 'expense',
    Icon: Wallet,
    labelKey: 'capture.expense',
    tint: colors.field100,
    ink: colors.field700,
  },
  {
    key: 'task',
    Icon: ListChecks,
    labelKey: 'capture.task',
    tint: colors.sky100,
    ink: colors.sky500,
  },
  {
    key: 'journal',
    Icon: NotebookPen,
    labelKey: 'capture.journal',
    tint: colors.journal100,
    ink: colors.journal600,
  },
] as const;

export function QuickActions() {
  const actions = useCaptureActions();

  function onPress(key: (typeof ACTIONS)[number]['key']) {
    if (key === 'expense') return actions.openExpense();
    if (key === 'task') return actions.openTask();
    return actions.openJournal();
  }

  return (
    <View style={styles.row}>
      {ACTIONS.map(({ key, Icon, labelKey, tint, ink }) => (
        <Pressable
          key={key}
          style={[styles.action, { backgroundColor: tint }]}
          onPress={() => onPress(key)}
          accessibilityRole="button"
          accessibilityLabel={t(labelKey)}
        >
          <Icon size={20} strokeWidth={2} color={ink} />
          <Text style={[styles.label, { color: ink }]}>{t(labelKey)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s8,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    paddingVertical: spacing.s12,
    borderRadius: radius.input,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    writingDirection: 'rtl',
  },
});
