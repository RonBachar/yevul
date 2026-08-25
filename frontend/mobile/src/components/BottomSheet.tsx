import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadowFloat, spacing } from '../theme/tokens';

// המעטפת המשותפת לגיליונות תחתונים, סקרים, גיליון וגבשושית האחיזה.
// נולדה ב-CaptureSheet ועברה לכאן כש-Forecast Update ועריכת הגידול
// במסך פרטי חלקה נזקקו לאותה מעטפת בדיוק. מומשת עם Modal של React
// Native ולא עם ספריית bottom sheet, כדי לא להוסיף תלות ב-reanimated,
// אותו נימוק בדיוק כמו ב-CaptureSheet.
//
// **טיפול המקלדת חי כאן ולא בגיליונות עצמם, וזו החלטה מבנית.** כל
// גיליון חדש עם שדה טקסט מקבל אותו טיפול בזכות המעטפת, בלי לזכור
// להוסיף אותו. שתי שכבות נדרשות ביחד, אחת לא מספיקה:
//
// 1. KeyboardAvoidingView מקטין את השטח הפנוי כשהמקלדת עולה.
// 2. ScrollView + maxHeight מאפשרים לתוכן להצטמצם בתוך השטח שנשאר.
//
// בלי (2), גיליון גבוה (TaskSheet, ארבעה שדות) פשוט נחתך: השטח קטן,
// התוכן לא, והשדות התחתונים יחד עם כפתור השמירה יוצאים מהמסך. זה בדיוק
// מה שקרה אחרי שהתווסף TaskSheet, ולכן התיקון כאן ולא שם.
const scrimColor = `${colors.ink900}6b`;

// הגיליון לא עולה מעל 88% מגובה המסך גם בלי מקלדת, כדי שה-scrim מאחוריו
// יישאר לחיץ לסגירה ושהגיליון ימשיך להיקרא כשכבה מעל המסך ולא כמסך מלא.
const MAX_SHEET_HEIGHT_RATIO = '88%';

export function BottomSheet({
  visible,
  onClose,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
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
        accessibilityLabel={closeLabel}
      />
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View style={styles.grabber} />
            {/* keyboardShouldPersistTaps: בלי זה הלחיצה הראשונה על "שמירה"
                או על צ'יפ, כשהמקלדת פתוחה, רק סוגרת את המקלדת ונבלעת,
                והמשתמש צריך ללחוץ פעמיים. */}
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: scrimColor,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    // maxHeight ולא height: גיליון קצר (CaptureSheet, שלוש שורות) נשאר
    // בגובה התוכן שלו, וגיליון גבוה נעצר ומתחיל לגלול במקום להיחתך.
    maxHeight: MAX_SHEET_HEIGHT_RATIO,
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.s24,
    ...shadowFloat,
  },
  // flexShrink מאפשר ל-SafeAreaView להצטמצם מתחת ל-maxHeight של הגיליון.
  // בלי זה ה-ScrollView שבתוכו לא מקבל גבול גובה ולא גולל בכלל.
  safeArea: {
    flexShrink: 1,
  },
  content: {
    paddingBottom: spacing.s8,
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
});
