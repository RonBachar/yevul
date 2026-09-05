import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  assignableMembers,
  myPlotIds,
  myPlotsToggleVisible,
  t,
  useCurrentFarm,
  useFarmProfit,
  useMembers,
  workerModeShell,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
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
  // מתג "החלקות שלי", design.md, "My Plots" Toggle. הרוסטר נטען לספירת
  // החברים ולזיהוי "אני"; רשימת החלקות מגיעה כבר מ-profit.plots, שנושאת
  // גם את האחראי לכל חלקה. state בלבד, לא נשמר, וברירת המחדל "הכל"
  // חוזרת בכל mount קר.
  const membersState = useMembers(supabase);
  // Worker Mode, design.md: לעובד שורת ההוצאה מושמטת גם מקיצורי הדרך של
  // הבית, לא רק מגיליון הרישום. התפקיד נגזר מ-useMembers (is_self) ולא
  // בהוק useMyRole נפרד, כדי לא לשאול את farm_members_view פעמיים.
  const shell = workerModeShell(membersState.myRole, membersState.loading);
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  // רק חברים פעילים נספרים למתג, design.md: "more than one member".
  // הזמנה ממתינה (status invited, בלי user_id) אינה חבר עדיין.
  const toggleVisible = myPlotsToggleVisible(
    assignableMembers(membersState.members).length,
    profit.plots,
  );
  const mine = scope === 'mine';
  // undefined כשהמתג לא נראה או בתצוגת "הכל": TaskBoard מפרש זאת
  // כ"בלי סינון". הסינון עצמו טהור ב-myPlotIds/tasksOnPlots.
  const filteredPlotIds =
    toggleVisible && mine ? myPlotIds(profit.plots, membersState.currentUserId) : undefined;

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
        <QuickActions kinds={shell.captureKinds} />
        {/* הכרטיס למעלה הוא צפי כלל-משקי ואינו מסונן; המתג יושב מתחתיו
            ושולט במה שאפשר לסנן, לוח המשימות. design.md, "My Plots"
            Toggle: "It filters plot cards and the task board together." */}
        {toggleVisible && (
          <View style={styles.myPlotsTrack} accessibilityRole="tablist">
            <Pressable
              style={[styles.myPlotsItem, !mine && styles.myPlotsItemActive]}
              onPress={() => setScope('all')}
              accessibilityRole="tab"
              accessibilityState={{ selected: !mine }}
            >
              <Text style={[styles.myPlotsLabel, !mine && styles.myPlotsLabelActive]}>
                {t('home.myPlots.all')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.myPlotsItem, mine && styles.myPlotsItemActive]}
              onPress={() => setScope('mine')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mine }}
            >
              <Text style={[styles.myPlotsLabel, mine && styles.myPlotsLabelActive]}>
                {t('home.myPlots.mine')}
              </Text>
            </Pressable>
          </View>
        )}
        <View style={styles.board}>
          <TaskBoard
            supabase={supabase}
            plotIds={filteredPlotIds}
            showPlotName
            alsoRefresh={[profit]}
          />
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
  // מתג "החלקות שלי". אותה גלולה מגזרית של טאבי פרטי החלקה, אבל קומפקטית
  // (alignSelf flex-start) כי שתי מילים קצרות לא צריכות למתוח את כל הרוחב.
  myPlotsTrack: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: spacing.s4,
    borderRadius: radius.pill,
    backgroundColor: colors.mist200,
  },
  myPlotsItem: {
    minHeight: touchTarget.min - 12,
    paddingHorizontal: spacing.s20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  myPlotsItemActive: {
    backgroundColor: colors.paper,
  },
  myPlotsLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  myPlotsLabelActive: {
    color: colors.field700,
  },
});
