import { Pressable, StyleSheet, Text, View } from 'react-native';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import TrendingDown from 'lucide-react-native/icons/trending-down';
import {
  formatAmount,
  formatSignedAmount,
  plotSummaryLine,
  profitTone,
  scaledAmountFontSize,
  t,
  type Currency,
  type PlotProfitRow,
} from '@yevul/shared';
import { colors, fonts, fontSize, profitToneColor, radius, spacing } from '../theme/tokens';

// כרטיס חלקה, design.md "Plot Card": רדיוס 20, רקע Mist-100, ריפוד 20.
// שם החלקה ב-subheading, שורת caption, ומספר הרווח ב-heading-lg עם
// אותו טיפול סימן+חץ+צבע כמו ה-Hero.
//
// מספר הרווח נוסף בשלב 4. עד אז הכרטיס הציג שטח, גידול ועונה בלבד,
// כי הוא דרש צבירת הכנסה מול הוצאה בפועל שלא הייתה קיימת.
//
// forecast הוא null כשאין לחלקה שטח, יבול או מחיר צפויים, וגם לעובד
// ששדות התחזית ממוסכים לו במסד. בשני המקרים הכרטיס פשוט חוזר להיות
// שם ושורת סיכום, בלי מספר ובלי מקום ריק שמרמז שמשהו נשבר.
export function PlotCard({
  plot,
  currency,
  onPress,
}: {
  plot: PlotProfitRow;
  currency: Currency;
  onPress: () => void;
}) {
  const forecast = plot.forecast;
  const tone = forecast ? profitTone(forecast.profit) : 'zero';
  const toneColor = profitToneColor(tone);
  const Glyph = tone === 'loss' ? TrendingDown : TrendingUp;
  const formatted = forecast ? formatSignedAmount(forecast.profit, currency) : '';

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
      <Text style={styles.name}>{plot.name}</Text>
      <Text style={styles.summary}>{plotSummaryLine(plot, plot.cropCycle)}</Text>

      {forecast && (
        <>
          <View style={styles.valueRow}>
            {tone !== 'zero' && <Glyph size={26} strokeWidth={2.5} color={toneColor} />}
            <Text
              style={[
                styles.value,
                {
                  color: toneColor,
                  fontSize: scaledAmountFontSize(formatted, fontSize.headingLg, 34),
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatted}
            </Text>
          </View>
          <Text style={styles.breakdown}>
            {t('plots.profit.income')} {formatAmount(forecast.expectedIncome, currency)} ·{' '}
            {t('plots.profit.expenses')} {formatAmount(forecast.expenses, currency)}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
    padding: spacing.s20,
    gap: spacing.s4,
  },
  name: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  summary: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    marginTop: spacing.s8,
  },
  // heading-lg/900, אותו טיפול כמו ה-Hero, design.md.
  value: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    writingDirection: 'ltr',
  },
  breakdown: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
});
