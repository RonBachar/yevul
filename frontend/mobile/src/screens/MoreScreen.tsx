import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@yevul/shared';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { ScreenPlaceholder } from './ScreenPlaceholder';

// טאב "עוד". לפי prd.md סעיף 4 הוא מחזיק הגדרות, חלקות וגידולים,
// אנשים ומנוי. כרגע רק זהות המשתמש והתנתקות, שעברו לכאן מהשלד הזמני
// שקדם לניווט. מסך ההגדרות עצמו הוא המשימה הבאה בשלב 2.
export function MoreScreen() {
  const { session } = useAuth();
  const email = session?.user.email ?? session?.user.id ?? '';

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <ScreenPlaceholder title={t('screen.more')}>
      <View style={styles.account}>
        <Text style={styles.meta}>
          {t('shell.signedInAs')} {email}
        </Text>
        <Pressable style={styles.signout} onPress={signOut} accessibilityRole="button">
          <Text style={styles.signoutText}>{t('shell.signOut')}</Text>
        </Pressable>
      </View>
    </ScreenPlaceholder>
  );
}

const styles = StyleSheet.create({
  account: {
    alignItems: 'center',
    gap: spacing.s16,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.ink900,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  signout: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border200,
  },
  signoutText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
  },
});
