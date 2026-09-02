import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Plus from 'lucide-react-native/icons/plus';
import { t, useFarmProfit, useFarmSettings, type PlotProfitRow } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { ListStateNote } from '../components/ListStateNote';
import { PlotCard } from '../components/PlotCard';
import type { PlotsStackParamList } from '../navigation/PlotsStack';

type Nav = NativeStackNavigationProp<PlotsStackParamList, 'PlotsIndex'>;

// רשימת החלקות, המשימה הראשונה של שלב 3. נבנית כ-Stack (PlotsStack)
// ולא כמסך טאב יחיד, כי חלקה נפתחת למסך פרטים משלה.
export function PlotsScreen() {
  const navigation = useNavigation<Nav>();
  // useFarmProfit ולא usePlots: הכרטיס מציג מספר רווח משלב 4, וההוק
  // הזה מחזיר את אותן חלקות בדיוק עם התחזית כבר מחושבת מולן.
  const profit = useFarmProfit(supabase);
  const { loading, failed, plots, refresh } = profit;
  const settings = useFarmSettings(supabase);
  const refreshControl = usePullToRefresh([profit]);

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

      {/* הרשימה מרונדרת תמיד, גם בלי שורות. שלושת המצבים שהיו כאן
          כשלושה בלוקים נפרדים ירדו ל-ListEmptyComponent, וזה מה שמשאיר
          את המסך נגיש למשיכה כשהטעינה נכשלה — בדיוק המצב שממנו החקלאי
          צריך לנסות שוב. */}
      <FlatList<PlotProfitRow>
        data={loading || failed ? [] : plots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl}
        ItemSeparatorComponent={CardGap}
        renderItem={({ item }) => (
          <PlotCard
            plot={item}
            currency={settings.form?.currency ?? 'ILS'}
            onPress={() => openPlot(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <ListStateNote
              loading={loading}
              failed={failed}
              errorKey="plots.loadError"
              emptyKey="plots.empty"
              align="center"
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}

// A separator and not `gap` on the content container. Virtualization swaps
// off-screen rows for spacer views, and a gap would be added around those too.
function CardGap() {
  return <View style={styles.cardGap} />;
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
  // flexGrow so the empty state fills the space left over. Without it a list
  // with no rows has no height, and on Android there is nothing to pull.
  list: {
    flexGrow: 1,
    padding: spacing.s24,
  },
  cardGap: {
    height: spacing.s16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
