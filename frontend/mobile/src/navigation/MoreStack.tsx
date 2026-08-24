import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreScreen } from '../screens/MoreScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme/tokens';

// טאב "עוד" הוא היחיד שמוביל פנימה למסכים נוספים, ולכן הוא סטאק ולא
// מסך יחיד. לפי prd.md סעיף 4 הוא מחזיק הגדרות, חלקות וגידולים, אנשים
// ומנוי. כרגע יש שם יעד אחד, הגדרות, והשאר נוספים בשלבים 6 ו-7.
const Stack = createNativeStackNavigator();

export function MoreStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // בלי headerTitleStyle, המסך היחיד שמדליק כותרת מעביר title ריק
        // ולכן טיפוגרפיית הכותרת לעולם לא מתרנדרת.
        headerTintColor: colors.field700,
        headerStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="MoreIndex" component={MoreScreen} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        // כותרת עם חזרה רק כאן. חץ החזרה מתהפך לבד תחת RTL כפוי,
        // ולכן לא מחליפים אותו ידנית.
        options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: '' }}
      />
    </Stack.Navigator>
  );
}
