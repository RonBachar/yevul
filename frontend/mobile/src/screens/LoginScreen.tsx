import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Provider } from '@supabase/supabase-js';
import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';

// משלים סשן אימות תלוי אם הדפדפן נפתח כבר (no-op בדרך כלל)
WebBrowser.maybeCompleteAuthSession();

// מסך התחברות לנייד. זרימת OAuth מסוג PKCE: פותחים דפדפן פנימי מול
// Supabase, חוזרים דרך ה-scheme yevul://, ומחליפים את הקוד לסשן.
// הלקוח לא מחליט הרשאות, כל האימות בשרת, והמשק כבר נוצר בטריגר.
export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);

  async function signInWith(provider: Provider) {
    setError(null);
    setPending(provider);
    try {
      const redirectTo = Linking.createURL('/');
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (authError || !data?.url) {
        setError(t('auth.error'));
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        return;
      }

      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code === 'string') {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(t('auth.error'));
        }
      } else {
        // המשתמש דחה את ההרשאה בספק, או שהחזרה לא כללה קוד תקין
        setError(t('auth.error'));
      }
    } catch {
      setError(t('auth.error'));
    } finally {
      setPending(null);
    }
  }

  const disabled = pending !== null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.brand}>
          <Text style={styles.logomark}>🌱</Text>
          <Text style={styles.title}>{t('app.name')}</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.btnGoogle, disabled && styles.btnDisabled]}
            onPress={() => signInWith('google')}
            disabled={disabled}
            accessibilityRole="button"
          >
            <Text style={styles.btnGoogleText}>{t('auth.continueWithGoogle')}</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnApple, disabled && styles.btnDisabled]}
            onPress={() => signInWith('apple')}
            disabled={disabled}
            accessibilityRole="button"
          >
            <Text style={styles.btnAppleText}>{t('auth.continueWithApple')}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.legal}>{t('auth.legal')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.s32,
    padding: spacing.s32,
    borderWidth: 1,
    borderColor: colors.border200,
    borderRadius: radius.card,
    backgroundColor: colors.paper,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.s8,
  },
  logomark: {
    fontSize: 56,
    lineHeight: 64,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    color: colors.field700,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodyLg,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  actions: {
    gap: spacing.s12,
  },
  btn: {
    // design.md, Border Radius: כפתורים הם גלולה. קודם היה כאן 12,
    // ערך שלא קיים במפרט בכלל, ונמצא בביקורת הארכיטקטורה של שלב 2.
    minHeight: touchTarget.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnGoogle: {
    backgroundColor: colors.paper,
    borderColor: colors.border200,
  },
  btnGoogleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
  },
  btnApple: {
    backgroundColor: colors.ink900,
  },
  btnAppleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.paper,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.loss600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  legal: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
