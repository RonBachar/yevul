import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Wallet from 'lucide-react-native/icons/wallet';
import ListChecks from 'lucide-react-native/icons/list-checks';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import { t } from '@yevul/shared';
import {
  colors,
  fonts,
  fontSize,
  radius,
  shadowFloat,
  spacing,
  touchTarget,
} from '../theme/tokens';

// גיליון הרישום, design.md, Capture Tab & Sheet. שלוש שורות, כל אחת
// אייקון, כותרת ושורת משנה, ומתחתן שורת caption שמתעדת את קיצור
// הלחיצה הארוכה. הטפסים עצמם נבנים בשלב 3 והמיקרופון בשלב 5, כאן
// רק נקודת הכניסה.
//
// מומש עם Modal של React Native ולא עם ספריית bottom sheet, כדי לא
// להוסיף תלות ב-reanimated. זה בדיוק הקונפליקט שהפיל את expo-router
// במונוריפו הזה, ואין סיבה להחזיר אותו בשביל גיליון של שלוש שורות.

// Ink-900 באטימות 42 אחוז. נגזר מהטוקן ולא נכתב כהקס, אחרת שינוי
// בפלטה היה מדלג בשקט על המשטח הזה.
const scrimColor = `${colors.ink900}6b`;

// המחרוזות נקראות בתוך הרכיב ולא ברמת המודול, כדי שהחלפת שפה בשלב 8
// תשפיע מיד ולא תיתקע על ערכים שנקראו פעם אחת בזמן ה-import.
export function CaptureSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('capture.close')}
      />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.grabber} />
            {options.map(({ key, Icon, title, hint }) => (
              <Pressable
                key={key}
                style={styles.row}
                onPress={onClose}
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
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // סקרים מעומעם ולא מטושטש, כי טשטוש נקרא רע באור שמש ועולה בביצועי
  // רינדור. הצבע נגזר מ-Ink-900 ולא נכתב כהקס, אחרת שינוי בפלטה היה
  // מדלג בשקט על המשטח הזה.
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: scrimColor,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.s24,
    paddingBottom: spacing.s8,
    ...shadowFloat,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.mist200,
    marginTop: spacing.s12,
    marginBottom: spacing.s16,
  },
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
