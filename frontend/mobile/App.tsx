import { ActivityIndicator, I18nManager, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { LoginScreen } from './src/screens/LoginScreen';
import { RootTabs } from './src/navigation/RootTabs';
import { t } from '@yevul/shared';
import { colors, fontSize, spacing } from './src/theme/tokens';

// כיווניות RTL נכפית לפני הרינדור, כמו בשלד שלב 0.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

const Stack = createNativeStackNavigator();

// ברירת המחדל של React Navigation צובעת את רקע הניווט ב-rgb(242,242,242),
// אפור בהיר. זה מציץ בכל מקום שהמסך לא מכסה במלואו, למשל ברצועה שמעליה
// מתרומם כפתור הרישום. design.md קובע ש-Paper, לבן טהור, הוא קנבס ברירת
// המחדל בכל מקום, ולכן הטוקנים שלנו נכפים על ערכת הנושא של הניווט במקום
// לתקן כל מסך בנפרד.
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.paper,
    card: colors.paper,
    primary: colors.field700,
    text: colors.ink900,
    border: colors.border200,
  },
};

// דפוס זרימת אימות של React Navigation: מציגים סטאק שונה לפי מצב הסשן.
// מחובר, נכנסים לניווט הטאבים המלא. לא מחובר, מסך הכניסה.
function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.field700} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="Main" component={RootTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  // הפונטים נטענים ממקור משותף אחד, packages/assets, בדיוק כמו שהווב
  // טוען אותם ב-tokens.css. עד ביקורת הארכיטקטורה של שלב 2 היה כאן
  // עותק מקומי תחת frontend/mobile/assets/fonts, זהה בייט אל בייט,
  // כך שהחלפת קובץ פונט במקום אחד הייתה משאירה את השני ישן בשקט.
  // metro.config.js כבר עוקב אחרי כל המונוריפו דרך watchFolders.
  const [fontsLoaded, fontError] = useFonts({
    'OedooPro-Regular': require('@yevul/assets/fonts/OedooPro-Regular.ttf'),
    'OedooPro-Medium': require('@yevul/assets/fonts/OedooPro-Medium.ttf'),
    'OedooPro-Bold': require('@yevul/assets/fonts/OedooPro-Bold.ttf'),
    // Black (900) נטען בשלב 4 בשביל Live P&L Hero Card. design.md מגדיר
    // את מספר הרווח כ-display/900 ומכנה אותו "the single largest element
    // in the product", ו-Bold (700) הרנדר אותו קל מדי בדיוק במקום שבו
    // המשקל נושא את כל ההיררכיה של המסך.
    'OedooPro-Black': require('@yevul/assets/fonts/OedooPro-Black.ttf'),
  });

  // כשל בטעינת פונט מוצג ולא נבלע. קודם השגיאה נזרקה לפח והמסך פשוט
  // החזיר null לנצח, כלומר מסך לבן בלי הודעה ובלי דרך להתאושש. הסיכון
  // גדל מאז שהפונטים נטענים מנתיב שחוצה workspace.
  if (fontError) {
    return (
      <View style={styles.center}>
        <Text style={styles.fatal}>{t('app.fontError')}</Text>
      </View>
    );
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  fatal: {
    // בכוונה בלי fontFamily. זו ההודעה שמוצגת כשהפונט שלנו לא נטען,
    // ולכן היא חייבת להסתמך על פונט המערכת ולא על OedooPro.
    fontSize: fontSize.body,
    color: colors.loss600,
    textAlign: 'center',
    paddingHorizontal: spacing.s24,
    writingDirection: 'rtl',
  },
});
