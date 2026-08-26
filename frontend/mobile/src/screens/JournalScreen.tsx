import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { JournalList } from '../components/JournalList';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/tokens';

// היומן הכללי, design.md "Journal List", נגיש מטאב "עוד". כל רשומות
// המשק, בלי סינון לפי חלקה. סינון עונה ופס קישור ליומן הריסוס
// (design.md) שייכים למשימת "מסך יומן ריסוס נפרד" הבאה ברודמאפ.
export function JournalScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.body}>
        <JournalList supabase={supabase} showPlotName />
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
  },
});
