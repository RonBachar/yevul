import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { t, useCurrentFarm, useFarmProfit } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { TaskBoard } from '../components/TaskBoard';
import { ProfitHeroCard } from '../components/ProfitHeroCard';
import { QuickActions } from '../components/QuickActions';

// מסך הבית. Live P&L Hero Card נבנה בשלב 4 ויושב בראש, לפי design.md,
// "The first thing the farmer sees on opening the app". לוח המשימות
// יורד מתחתיו, ולפי המסמך הוא דייר במסך הזה ולא בעליו.
//
// **הכרטיס מקובע והלוח הוא שגולל**, ולא מסך אחד גליל. המסך עצמו אינו
// ScrollView, ולכן ה-SectionList של TaskBoard הוא הגולל היחיד כאן ואין
// קינון רשימות. זו גם הפריסה הנכונה מבחינת המסמך: המספר הוא בעל המסך
// ולא אמור להיגלל אל מחוץ לתצוגה.
//
// **The profit query is owned here and not inside the card.** Pull-to-refresh
// hangs on the task board, the only thing on this screen that scrolls, and a
// pull on the home screen has to reload the big number as well as the tasks —
// so the screen holds the data and passes it both ways.
export function HomeScreen() {
  const { farm } = useCurrentFarm(supabase);
  const profit = useFarmProfit(supabase);

  // רענון בכל חזרה למסך, בדיוק כמו PlotsScreen ו-PlotDetailScreen.
  // בלעדיו מספר הרווח נטען פעם אחת ונשאר תקוע: בניווט טאבים המסך
  // נשאר מעוגן ואינו נבנה מחדש, כך שהוספת הוצאה בטאב הכסף לא הייתה
  // משתקפת כאן עד סגירת האפליקציה.
  //
  // **זהו גם התחליף לצ'יפ הטריות שהיה כאן.** הצ'יפ דיווח על תסמין
  // ("המספר הזה בן שעה") בלי לתת לחקלאי מה לעשות איתו, בעוד שהסיבה
  // האמיתית הייתה חוסר הרענון הזה. נמחק בהחלטת היזם 2026-08-29.
  useFocusEffect(
    useCallback(() => {
      profit.refresh();
    }, [profit.refresh]),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>{t('screen.home')}</Text>
      <View style={styles.body}>
        <ProfitHeroCard farmName={farm?.name ?? null} state={profit} />
        {/* שלושה קיצורי דרך, בהחלטת היזם 2026-08-31. רישום הוצאה יורד
            מלחיצה על כפתור הרישום ובחירה מגיליון, ללחיצה אחת. */}
        <QuickActions />
        <View style={styles.board}>
          <TaskBoard supabase={supabase} showPlotName alsoRefresh={[profit]} />
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
