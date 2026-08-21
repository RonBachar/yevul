import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';

// שלד מאומת זמני לנייד. הניווט האמיתי, ארבעה טאבים וכפתור Capture,
// נבנה במשימת "שלד ניווט בנייד" בהמשך שלב 2. כאן רק מוכיחים שהסשן
// קיים ושהתנתקות עובדת.
export function AuthedShell({ session }: { session: Session }) {
  const email = session.user.email ?? session.user.id;

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.bar}>
        <Text style={styles.title}>{t('app.name')}</Text>
        <Pressable style={styles.signout} onPress={signOut} accessibilityRole="button">
          <Text style={styles.signoutText}>{t('shell.signOut')}</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.meta}>
          {t('shell.signedInAs')} {email}
        </Text>
        <Text style={styles.placeholder}>{t('shell.placeholder')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s24,
    paddingVertical: spacing.s16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border200,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.field700,
  },
  signout: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.s16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border200,
  },
  signoutText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s12,
    padding: spacing.s24,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.ink900,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  placeholder: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
