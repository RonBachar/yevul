import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

// המעטפת המשותפת למסכי טופס מלאים, המקבילה של BottomSheet לגיליונות.
//
// **הסיבה שהיא קיימת היא המקלדת, וזו הסיבה היחידה.** כל מסך שיש בו
// שדה טקסט חייב את אותם שלושה דברים ביחד, ובלי מעטפת הם נשכחים בכל
// מסך חדש מחדש, בדיוק מה שקרה בטופס הוספת חלקה: שדה "שם הגידול",
// שנמצא בתחתית הטופס, נעלם לגמרי מתחת למקלדת.
//
// 1. KeyboardAvoidingView מקטין את השטח הפנוי כשהמקלדת עולה.
// 2. ScrollView עם flex אמיתי מקבל את הגבול הזה ומאפשר לגלול אל השדה
//    הממוקד במקום שהוא ייחתך מתחת למקלדת.
// 3. keyboardShouldPersistTaps כדי שהלחיצה הראשונה על "שמירה", כשהמקלדת
//    פתוחה, לא תיבלע רק כדי לסגור את המקלדת.
//
// header הוא אופציונלי ויושב **מחוץ** לגלילה, כי כותרת ולחצן חזרה לא
// אמורים לזוז כשגוללים בטופס. מסך שמעדיף כותרת שנגללת יחד עם התוכן
// (מסך ההגדרות) פשוט מעביר אותה כילד רגיל ולא כ-header.
//
// המעטפת לא מחליטה שום דבר על תוכן הטופס עצמו, בדיוק כמו BottomSheet.
// היא בעלת הקונטיינר והמקלדת בלבד.
export function FormScreen({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {header ? <View>{header}</View> : null}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  // flex על ה-ScrollView עצמו ולא רק על התוכן. בלעדיו הגלילה מקבלת את
  // גובה התוכן במקום את השטח שנשאר אחרי שהמקלדת עלתה, ואז אין לאן
  // לגלול והשדה התחתון נשאר מתחת למקלדת. אותו באג בדיוק כמו בלוח
  // המשימות, שם הוא התבטא במסך שנמתח מעבר לגובהו.
  fill: {
    flex: 1,
  },
  body: {
    padding: spacing.s24,
    paddingBottom: spacing.s48,
    gap: spacing.s24,
  },
});
