import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '@yevul/shared';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';

// מעטפת זמנית למסכי השלד. כל מסך יחליף אותה בתוכן אמיתי כשהמשימה שלו
// מגיעה בשלב 3 ובשלב 4, ואז הרכיב הזה נמחק. קיים רק כדי שארבעת
// המסכים הריקים לא יהיו ארבעה עותקים של אותן שלושים שורות.
export function ScreenPlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>
        <Text style={styles.note}>{t('screen.comingSoon')}</Text>
        {children}
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s16,
    paddingHorizontal: spacing.s24,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
