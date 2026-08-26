import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlotsScreen } from '../screens/PlotsScreen';
import { PlotDetailScreen } from '../screens/PlotDetailScreen';
import { PlotFormScreen } from '../screens/PlotFormScreen';
import { SprayLogScreen } from '../screens/SprayLogScreen';
import { colors } from '../theme/tokens';

// טאב "חלקות" מוביל פנימה למסך פרטים ולטופס יצירה/עריכה, ולכן הוא
// סטאק ולא מסך יחיד, אותה תבנית כמו MoreStack. כל שלושת המסכים
// מנהלים את הכותרת וכפתור החזרה שלהם בעצמם (RTL, chevron-right), כי
// הם שונים ממסך ההגדרות ולא רק כותרת עם חזרה סטנדרטית.
//
// ParamList מוקלד, בניגוד ל-MoreStack, כי PlotDetail ו-PlotForm
// מקבלים פרמטרים אמיתיים (plotId). בלי טיפוס מפורש navigate() קורס
// ל-never ומאבד בדיקת שגיאות בדיוק במקום שהכי קל לטעות בו, שם שדה.
export type PlotsStackParamList = {
  PlotsIndex: undefined;
  PlotDetail: { plotId: string };
  PlotForm: { plotId?: string } | undefined;
  SprayLog: { plotId?: string } | undefined;
};

const Stack = createNativeStackNavigator<PlotsStackParamList>();

export function PlotsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PlotsIndex" component={PlotsScreen} />
      <Stack.Screen name="PlotDetail" component={PlotDetailScreen} />
      <Stack.Screen name="PlotForm" component={PlotFormScreen} />
      {/* מסך יומן הריסוס גם רשום ב-MoreStack (מ"עוד" ומהיומן הכללי).
          כאן הוא מקבל כותרת עם חזרה כדי לחזור לפרטי החלקה, לא למקור
          אחר קבוע, design.md, Spray Log Screen. */}
      <Stack.Screen
        name="SprayLog"
        component={SprayLogScreen}
        options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: '', headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.field700 }}
      />
    </Stack.Navigator>
  );
}
