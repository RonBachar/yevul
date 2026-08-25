import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t, useFarmSettings } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { TaskBoard } from '../components/TaskBoard';

// מסך הבית. Live P&L Hero Card, Data Freshness Chip וכרטיסי חלקות
// נבנים בשלב 4, לפי הרודמאפ. לוח המשימות, כל המשק ולא חלקה בודדת
// (בלי plotId), הוא התוכן האמיתי הראשון כאן.
export function HomeScreen() {
  const settings = useFarmSettings(supabase);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>{t('screen.home')}</Text>
      <View style={styles.body}>
        <TaskBoard supabase={supabase} showPlotName currency={settings.form?.currency ?? 'ILS'} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    color: colors.ink900,
    paddingHorizontal: spacing.s24,
    paddingTop: spacing.s16,
    writingDirection: 'rtl',
  },
  body: {
    flex: 1,
    padding: spacing.s24,
  },
});
