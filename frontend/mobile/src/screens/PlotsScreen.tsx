import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Plus from 'lucide-react-native/icons/plus';
import { t, useFarmProfit, useFarmSettings, type PlotProfitRow } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { PlotCard } from '../components/PlotCard';
import type { PlotsStackParamList } from '../navigation/PlotsStack';

type Nav = NativeStackNavigationProp<PlotsStackParamList, 'PlotsIndex'>;

// רשימת החלקות, המשימה הראשונה של שלב 3. נבנית כ-Stack (PlotsStack)
// ולא כמסך טאב יחיד, כי חלקה נפתחת למסך פרטים משלה.
export function PlotsScreen() {
  const navigation = useNavigation<Nav>();
  // useFarmProfit ולא usePlots: הכרטיס מציג מספר רווח משלב 4, וההוק
  // הזה מחזיר את אותן חלקות בדיוק עם התחזית כבר מחושבת מולן.
  const { loading, failed, plots, refresh } = useFarmProfit(supabase);
  const settings = useFarmSettings(supabase);

  // useFocusEffect ולא useEffect בלבד: בניווט מבוסס Stack המסך לא
  // נבנה מחדש כשחוזרים אליו מ-PlotForm אחרי יצירה, הוא רק חוזר
  // לפוקוס. בלי זה חלקה חדשה לא הייתה מופיעה עד ריענון ידני.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function openPlot(plotId: string) {
    navigation.navigate('PlotDetail', { plotId });
  }

  function openNewPlot() {
    navigation.navigate('PlotForm', undefined);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('screen.plots')}</Text>
        <Pressable style={styles.newButton} onPress={openNewPlot} accessibilityRole="button">
          <Plus size={20} strokeWidth={2.5} color={colors.paper} />
          <Text style={styles.newButtonText}>{t('plots.new')}</Text>
        </Pressable>
      </View>

      {loading && (
        <View style={styles.center}>
          <Text style={styles.note}>{t('common.loading')}</Text>
        </View>
      )}

      {!loading && failed && (
        <View style={styles.center}>
          <Text style={formStyles.bad}>{t('plots.loadError')}</Text>
        </View>
      )}

      {!loading && !failed && plots.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.note}>{t('plots.empty')}</Text>
        </View>
      )}

      {!loading && !failed && plots.length > 0 && (
        <FlatList<PlotProfitRow>
          data={plots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <PlotCard
              plot={item}
              currency={settings.form?.currency ?? 'ILS'}
              onPress={() => openPlot(item.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s24,
    paddingTop: spacing.s16,
    paddingBottom: spacing.s8,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  newButton: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s20,
    borderRadius: radius.pill,
    backgroundColor: colors.field700,
  },
  newButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.paper,
  },
  list: {
    padding: spacing.s24,
    gap: spacing.s16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
