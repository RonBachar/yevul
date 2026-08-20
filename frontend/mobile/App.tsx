import { useEffect } from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';

if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
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
    <View style={styles.container}>
      <Text style={styles.title}>שלום עולם, חקלאי רווחי</Text>
      <Text style={styles.subtitle}>בדיקת כיווניות RTL ופונט OedooPro</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontFamily: 'OedooPro-Bold',
    fontSize: 24,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontFamily: 'OedooPro-Regular',
    fontSize: 16,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 12,
  },
});
