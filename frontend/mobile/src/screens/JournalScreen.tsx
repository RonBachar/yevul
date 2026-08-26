import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import SprayCan from 'lucide-react-native/icons/spray-can';
import { t } from '@yevul/shared';
import { JournalList } from '../components/JournalList';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';

// היומן הכללי, design.md "Journal List", נגיש מטאב "עוד". כל רשומות
// המשק, בלי סינון לפי חלקה. סינון עונה לא נבנה כאן במכוון, שייך
// לליטוש עתידי, ראה docs/roadmap.md.
export function JournalScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.body}>
        {/* פס קבוע שמקשר החוצה למסך יומן הריסוס, design.md, Journal
            List: "a יומן ריסוס pill... links out to the dedicated
            Spray Log screen rather than just filtering in place". */}
        <Pressable
          style={styles.sprayLogRow}
          onPress={() => navigation.navigate('SprayLog' as never)}
          accessibilityRole="button"
        >
          <SprayCan size={20} strokeWidth={2} color={colors.field700} />
          <Text style={styles.sprayLogLabel}>{t('sprayLog.title')}</Text>
          <ChevronLeft size={20} strokeWidth={2} color={colors.slate600} />
        </Pressable>

        <View style={styles.list}>
          <JournalList supabase={supabase} showPlotName />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  body: {
    flex: 1,
    padding: spacing.s24,
    gap: spacing.s16,
  },
  sprayLogRow: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.pill,
    backgroundColor: colors.field100,
  },
  sprayLogLabel: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
  list: {
    flex: 1,
  },
});
