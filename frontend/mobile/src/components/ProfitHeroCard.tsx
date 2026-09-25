import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import TrendingDown from 'lucide-react-native/icons/trending-down';
import {
  formatAmount,
  formatSignedAmount,
  profitTone,
  scaledAmountFontSize,
  t,
  useFarmEntitlement,
  useFarmSettings,
  type Currency,
  type FarmProfitState,
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

// **The profit query itself now lives in HomeScreen.** The card is pinned
// above a task board the farmer can pull down to refresh, and that pull has to
// reload the big number too — so the screen owns the data it shows and hands
// it here. The refresh-on-focus that used to sit in this file moved up with
// it, word for word.
export function ProfitHeroCard({
  farmName,
  state,
}: {
  farmName: string | null;
  state: FarmProfitState;
}) {
  const { loading, failed, forecast, renderable, farmId } = state;
  const settings = useFarmSettings(supabase);
  const { entitled } = useFarmEntitlement(supabase, farmId);

  if (loading || failed || !renderable) return null;

  return (
    <HeroCardView
      farmName={farmName}
      profit={forecast.profit}
      expectedIncome={forecast.expectedIncome}
      plotExpenses={forecast.plotExpenses}
      plotExpensesTracked={forecast.plotExpensesTracked}
      // **`false` ולא falsy.** entitled הוא null כשעוד לא יודעים, ו-null
      // נקרא כ"מותר": להסתיר בלוק ממי ששילם בגלל שאילתה שטרם חזרה גרוע
      // מלהראות אותו רגע למי שלא. ראה entitlement.ts.
      farmExpenses={entitled === false ? 0 : forecast.farmExpenses}
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
  plotExpenses,
  plotExpensesTracked,
  farmExpenses,
  hasPlotsWithoutForecast,
  isEmptyFarm,
  currency,
}: {
  farmName: string | null;
  profit: number;
  expectedIncome: number;
  plotExpenses: number;
  plotExpensesTracked: boolean;
  // כבר מאופס לאפס על ידי הקורא כשאין זכאות, כדי שהתצוגה לא תחזיק
  // גם היא עותק של כלל הזכאות.
  farmExpenses: number;
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
            {t('home.profit.plotExpenses')} {formatAmount(plotExpenses, currency)}
          </Text>

          {/* Wheat ולא Loss-600, לפי אותו כלל שכבר חל בפרטי חלקה:
              המסר הוא "עוד לא מוצג לך הכל", לא "אתה מפסיד כסף". */}
          {!plotExpensesTracked && (
            <Text style={styles.caveatWheat}>{t('plots.profit.noExpensesYet')}</Text>
          )}
          {hasPlotsWithoutForecast && (
            <Text style={styles.caveatWheat}>{t('home.profit.someWithoutForecast')}</Text>
          )}
        </>
      )}

      {/* הוצאות המשק, 2026-09-25. **מעל קו מפריד ולא עוד שורת caveat.**
          הן אינן הסתייגות על המספר הגדול, הן מספר אחר שלא נכנס אליו,
          ושני מספרים באותו כרטיס בלי גבול ביניהם נקראים כאותו חשבון. */}
      {farmExpenses > 0 && (
        <View style={styles.farmBlock}>
          <View style={styles.farmRow}>
            <Text style={styles.farmLabel}>{t('home.farmExpenses.title')}</Text>
            <Text style={styles.farmValue}>{formatAmount(farmExpenses, currency)}</Text>
          </View>
          <Text style={styles.caveat}>{t('home.farmExpenses.note')}</Text>
        </View>
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
    fontFamily: fonts.bold,
    writingDirection: 'ltr',
  },
  breakdown: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  // הוצאות המשק. הקו העליון הוא ההפרדה בין מספר שמחשב למספר שלא.
  farmBlock: {
    marginTop: spacing.s12,
    paddingTop: spacing.s12,
    borderTopWidth: 1,
    borderTopColor: colors.border200,
  },
  farmRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s16,
  },
  farmLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  // Slate ולא Ink: משקל חזותי נמוך מהמספרים שכן מחשבים.
  farmValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodyLg,
    color: colors.slate600,
    writingDirection: 'ltr',
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
