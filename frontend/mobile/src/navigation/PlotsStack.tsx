import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlotsScreen } from '../screens/PlotsScreen';
import { PlotDetailScreen } from '../screens/PlotDetailScreen';
import { PlotFormScreen } from '../screens/PlotFormScreen';

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
};

const Stack = createNativeStackNavigator<PlotsStackParamList>();

export function PlotsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PlotsIndex" component={PlotsScreen} />
      <Stack.Screen name="PlotDetail" component={PlotDetailScreen} />
      <Stack.Screen name="PlotForm" component={PlotFormScreen} />
    </Stack.Navigator>
  );
}
