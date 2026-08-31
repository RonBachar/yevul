import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t, useCurrentFarm } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { TaskBoard } from '../components/TaskBoard';
import { ProfitHeroCard } from '../components/ProfitHeroCard';
import { QuickActions } from '../components/QuickActions';

// מסך הבית. Live P&L Hero Card נבנה בשלב 4 ויושב בראש, לפי design.md,
// "The first thing the farmer sees on opening the app". לוח המשימות
// יורד מתחתיו, ולפי המסמך הוא דייר במסך הזה ולא בעליו.
//
// כרטיס הרווח מרענן את עצמו בכל חזרה למסך, ראה ProfitHeroCard.
//
// **הכרטיס מקובע והלוח הוא שגולל**, ולא מסך אחד גליל. ל-TaskBoard יש
// ScrollView משלו, וקינון שני ScrollView באותו כיוון שובר את הגלילה
// הפנימית ב-RN. זו גם הפריסה הנכונה מבחינת המסמך: המספר הוא בעל
// המסך ולא אמור להיגלל אל מחוץ לתצוגה.
export function HomeScreen() {
  const { farm } = useCurrentFarm(supabase);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>{t('screen.home')}</Text>
      <View style={styles.body}>
        <ProfitHeroCard farmName={farm?.name ?? null} />
        {/* שלושה קיצורי דרך, בהחלטת היזם 2026-08-31. רישום הוצאה יורד
            מלחיצה על כפתור הרישום ובחירה מגיליון, ללחיצה אחת. */}
        <QuickActions />
        <View style={styles.board}>
          <TaskBoard supabase={supabase} showPlotName />
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
    gap: spacing.s24,
  },
  board: {
    flex: 1,
  },
});
