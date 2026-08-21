import { useEffect } from 'react';
import { ActivityIndicator, I18nManager, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { LoginScreen } from './src/screens/LoginScreen';
import { AuthedShell } from './src/screens/AuthedShell';
import { colors } from './src/theme/tokens';

// כיווניות RTL נכפית לפני הרינדור, כמו בשלד שלב 0.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

const Stack = createNativeStackNavigator();

// דפוס זרימת אימות של React Navigation: מציגים סטאק שונה לפי מצב הסשן.
// הניווט המלא, ארבעה טאבים וכפתור Capture, ייבנה במשימת שלד הניווט
// בהמשך שלב 2, מתחת למסך המאומת.
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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="Home">{() => <AuthedShell session={session} />}</Stack.Screen>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'OedooPro-Regular': require('./assets/fonts/OedooPro-Regular.ttf'),
    'OedooPro-Medium': require('./assets/fonts/OedooPro-Medium.ttf'),
    'OedooPro-Bold': require('./assets/fonts/OedooPro-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      console.log('OedooPro fonts loaded, RTL is', I18nManager.isRTL);
    }
  }, [fontsLoaded]);

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
});
