import { Pressable, StyleSheet, Text } from 'react-native';
import { plotSummaryLine, type PlotWithCropCycle } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';

// כרטיס חלקה, design.md "Plot Card": רדיוס 20, רקע Mist-100, ריפוד 20.
// שם החלקה ב-subheading, ומתחתיו שורת caption.
//
// design.md מפרט גם מספר רווח ב-heading-lg על הכרטיס, אבל זה דורש
// צבירת הכנסה מול הוצאה בפועל שנבנית רק בשלב 4. עד אז הכרטיס מציג
// שטח, גידול ועונה בלבד. ראה docs/open-items.md.
export function PlotCard({ plot, onPress }: { plot: PlotWithCropCycle; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
      <Text style={styles.name}>{plot.name}</Text>
      <Text style={styles.summary}>{plotSummaryLine(plot, plot.cropCycle)}</Text>
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
});
