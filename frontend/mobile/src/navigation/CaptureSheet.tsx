import { Pressable, StyleSheet, Text, View } from 'react-native';
import Wallet from 'lucide-react-native/icons/wallet';
import ListChecks from 'lucide-react-native/icons/list-checks';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import { t } from '@yevul/shared';
import { colors, fonts, fontSize, spacing, touchTarget } from '../theme/tokens';
import { BottomSheet } from '../components/BottomSheet';

// גיליון הרישום, design.md, Capture Tab & Sheet. שלוש שורות, כל אחת
// אייקון, כותרת ושורת משנה, ומתחתן שורת caption שמתעדת את קיצור
// הלחיצה הארוכה. הטפסים עצמם נבנים בשלב 3 והמיקרופון בשלב 5, כאן
// רק נקודת הכניסה.
//
// המחרוזות נקראות בתוך הרכיב ולא ברמת המודול, כדי שהחלפת שפה בשלב 8
// תשפיע מיד ולא תיתקע על ערכים שנקראו פעם אחת בזמן ה-import.
//
// onJournalPress הוא היחיד מבין השלושה שכבר מחובר בפועל, שלב 3: יומן
// ומשימות עצמאיים בסכמה, אבל רק היומן קיבל מסך יצירה עד כה. הוצאה
// ומשימה נשארות סוגרות בלבד עד שהמסכים שלהן נבנים.
export function CaptureSheet({
  visible,
  onClose,
  onJournalPress,
}: {
  visible: boolean;
  onClose: () => void;
  onJournalPress: () => void;
}) {
  const options = [
    { key: 'expense', Icon: Wallet, title: t('capture.expense'), hint: t('capture.expenseHint') },
    { key: 'task', Icon: ListChecks, title: t('capture.task'), hint: t('capture.taskHint') },
    {
      key: 'journal',
      Icon: NotebookPen,
      title: t('capture.journal'),
      hint: t('capture.journalHint'),
    },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      {options.map(({ key, Icon, title, hint }) => (
        <Pressable
          key={key}
          style={styles.row}
          onPress={key === 'journal' ? onJournalPress : onClose}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${hint}`}
        >
          <Icon size={24} strokeWidth={2} color={colors.field700} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text style={styles.rowHint}>{hint}</Text>
          </View>
        </Pressable>
      ))}
      <Text style={styles.micHint}>{t('capture.micHint')}</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s16,
    paddingVertical: spacing.s12,
  },
  rowText: {
    flex: 1,
    gap: spacing.s4,
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  rowHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  micHint: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingTop: spacing.s12,
    paddingBottom: spacing.s16,
  },
});
