import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import TrendingDown from 'lucide-react-native/icons/trending-down';
import {
  formatAmount,
  formatSignedAmount,
  profitTone,
  scaledAmountFontSize,
  t,
  useFarmProfit,
  useFarmSettings,
  type Currency,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, profitToneColor, radius, spacing } from '../theme/tokens';

// Live P&L Hero Card, שלב 4, design.md. "The first thing the farmer sees
// on opening the app."
//
// המילה "צפי" בתווית אינה קישוט. המספר הזה הוא הכלאה, הכנסה משוערת
// שהחקלאי הקליד בעצמו פחות הוצאות אמיתיות שנרשמו, ו-design.md מנמק
// באורך למה אסור שייקרא כרווח שכבר קרה: טעות הקלדה ביבול או במחיר
// מייצרת מספר שנראה בדיוק כמו רווח אמיתי.
//
// **הכרטיס אינו מרונדר לעובד, בלי בדיקת תפקיד בקליינט.** שדות התחזית
// ממוסכים ל-null ב-crop_cycles_view והוא חסום ברמת השורה מטבלאות
// הכסף, ולכן הוא מגיע לכאן עם חלקות ובלי אף הכנסה, ו-renderable יוצא
// false. משק חדש בלי חלקות בכלל הוא מצב אחר, ושם design.md דורש דווקא
// כן להציג ₪0 ב-Ink-900.

export function ProfitHeroCard({ farmName }: { farmName: string | null }) {
  const { loading, failed, forecast, renderable, refresh } = useFarmProfit(supabase);
  const settings = useFarmSettings(supabase);

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
      refresh();
    }, [refresh]),
  );

  if (loading || failed || !renderable) return null;

  return (
    <HeroCardView
      farmName={farmName}
      profit={forecast.profit}
      expectedIncome={forecast.expectedIncome}
      expenses={forecast.expenses}
      expensesTracked={forecast.expensesTracked}
      hasGeneralExpenses={forecast.generalExpenses > 0}
      hasPlotsWithoutForecast={forecast.plotsWithoutForecast > 0}
      isEmptyFarm={forecast.plotsWithForecast === 0}
      currency={settings.form?.currency ?? 'ILS'}
    />
  );
}

// מופרד מההוק כדי שהאנימציה תוכל להיתלות בערך עצמו בלי לרוץ שוב בכל
// רינדור של המסך שמעליו.
function HeroCardView({
  farmName,
  profit,
  expectedIncome,
  expenses,
  expensesTracked,
  hasGeneralExpenses,
  hasPlotsWithoutForecast,
  isEmptyFarm,
  currency,
}: {
  farmName: string | null;
  profit: number;
  expectedIncome: number;
  expenses: number;
  expensesTracked: boolean;
  hasGeneralExpenses: boolean;
  hasPlotsWithoutForecast: boolean;
  isEmptyFarm: boolean;
  currency: Currency;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(profit);

  // "On update, the number does a brief (200ms) scale-pulse (1.0 → 1.03 →
  // 1.0) to confirm this just changed", design.md. רץ רק כשהערך באמת
  // השתנה, לא בטעינה הראשונה, אחרת הוא מאשר שינוי שלא קרה. מכובה
  // כשהמשתמש ביקש תנועה מופחתת במערכת ההפעלה.
  useEffect(() => {
    if (previous.current === profit) return;
    previous.current = profit;

    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.03, duration: 100, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
    });

    return () => {
      cancelled = true;
    };
  }, [profit, scale]);

  const tone = profitTone(profit);
  const toneColor = profitToneColor(tone);
  const Glyph = tone === 'loss' ? TrendingDown : TrendingUp;
  const formatted = formatSignedAmount(profit, currency);

  return (
    <View style={styles.card}>
      <Text style={styles.label} numberOfLines={1}>
        {farmName ? `${farmName} · ${t('home.profit.forecast')}` : t('home.profit.forecast')}
      </Text>

      <Animated.View style={[styles.valueRow, { transform: [{ scale }] }]}>
        {tone !== 'zero' && <Glyph size={34} strokeWidth={2.5} color={toneColor} />}
        <Text
          style={[
            styles.value,
            { color: toneColor, fontSize: scaledAmountFontSize(formatted, fontSize.display, 44) },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatted}
        </Text>
      </Animated.View>

      {/* משק חדש בלי חלקות: ₪0 לבדו. פירוט של אפס מול אפס והסתייגויות
          על נתונים חסרים הם רעש בפעם הראשונה שחקלאי פותח את האפליקציה. */}
      {!isEmptyFarm && (
        <>
          <Text style={styles.breakdown}>
            {t('plots.profit.income')} {formatAmount(expectedIncome, currency)} ·{' '}
            {t('plots.profit.expenses')} {formatAmount(expenses, currency)}
          </Text>

          {/* Wheat ולא Loss-600, לפי אותו כלל שכבר חל בפרטי חלקה:
              המסר הוא "עוד לא מוצג לך הכל", לא "אתה מפסיד כסף". */}
          {!expensesTracked && (
            <Text style={styles.caveatWheat}>{t('plots.profit.noExpensesYet')}</Text>
          )}
          {hasPlotsWithoutForecast && (
            <Text style={styles.caveatWheat}>{t('home.profit.someWithoutForecast')}</Text>
          )}
          {/* בלי השורה הזו ההפרש בין המספר הגדול לסכום כרטיסי החלקות
              שמתחתיו נראה כמו שגיאת חישוב. */}
          {hasGeneralExpenses && (
            <Text style={styles.caveat}>{t('home.profit.includesGeneral')}</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // hairline ולא צל. design.md, Elevation: המערכת היא hairline first,
  // והצל שמור לאלמנטים מרחפים בלבד.
  card: {
    borderRadius: radius.sheet,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border200,
    padding: spacing.s20,
    gap: spacing.s4,
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
  },
  // display/900, "the single largest element in the product", design.md.
  value: {
    flexShrink: 1,
    fontFamily: fonts.black,
    writingDirection: 'ltr',
  },
  breakdown: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  caveat: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  caveatWheat: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.wheat800,
    writingDirection: 'rtl',
  },
});
