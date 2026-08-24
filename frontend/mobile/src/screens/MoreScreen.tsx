import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Settings } from 'lucide-react-native';
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
  const navigation = useNavigation();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const email = session?.user.email ?? session?.user.id ?? '';

  // כשל בהתנתקות מוצג ולא נבלע, אותו תיקון כמו בווב.
  async function signOut() {
    setSignOutFailed(false);
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutFailed(true);
  }

  return (
    <ScreenPlaceholder title={t('screen.more')}>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('Settings' as never)}
        accessibilityRole="button"
      >
        <Settings size={24} strokeWidth={2} color={colors.field700} />
        <Text style={styles.rowLabel}>{t('screen.settings')}</Text>
        {/* חץ הכניסה פונה שמאלה תחת RTL, זה הכיוון "פנימה" */}
        <ChevronLeft size={24} strokeWidth={2} color={colors.slate600} />
      </Pressable>

      <View style={styles.account}>
        <Text style={styles.meta}>
          {t('shell.signedInAs')} {email}
        </Text>
        <Pressable style={styles.signout} onPress={signOut} accessibilityRole="button">
          <Text style={styles.signoutText}>{t('shell.signOut')}</Text>
        </Pressable>
        {signOutFailed && <Text style={styles.signoutError}>{t('shell.signOutError')}</Text>}
      </View>
    </ScreenPlaceholder>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.min,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s16,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border200,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
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
  signoutError: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.loss600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  signoutText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
  },
});
