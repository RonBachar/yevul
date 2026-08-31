import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Provider } from '@supabase/supabase-js';
import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';

// משתמש הבדיקה מ-backend/supabase/seed.sql, קיים רק ב-DB המקומי.
// כפתור הכניסה איתו מוצג רק ב-__DEV__ (קבוע גלובלי של Metro, false
// בבילד release), כדי לבדוק זרימות בלי גוגל/אפל אמיתיים, בדיוק כמו
// window.supabase שנחשף רק ב-DEV בלקוח הווב.
const DEV_DEMO_EMAIL = 'demo-owner@yevul.app';
const DEV_DEMO_PASSWORD = 'password123';

// משלים סשן אימות תלוי אם הדפדפן נפתח כבר (no-op בדרך כלל)
WebBrowser.maybeCompleteAuthSession();

// מסך התחברות לנייד. זרימת OAuth מסוג PKCE: פותחים דפדפן פנימי מול
// Supabase, חוזרים דרך ה-scheme yevul://, ומחליפים את הקוד לסשן.
// הלקוח לא מחליט הרשאות, כל האימות בשרת, והמשק כבר נוצר בטריגר.
export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | 'dev' | null>(null);

  async function signInWithDevDemoUser() {
    setError(null);
    setPending('dev');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: DEV_DEMO_EMAIL,
      password: DEV_DEMO_PASSWORD,
    });
    if (authError) setError(t('auth.error'));
    setPending(null);
  }

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
            <GoogleMark />
            <Text style={styles.btnGoogleText}>{t('auth.continueWithGoogle')}</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnApple, disabled && styles.btnDisabled]}
            onPress={() => signInWith('apple')}
            disabled={disabled}
            accessibilityRole="button"
          >
            <AppleMark />
            <Text style={styles.btnAppleText}>{t('auth.continueWithApple')}</Text>
          </Pressable>

          {/* __DEV__ בלבד, ראה ההערה למעלה. לא מגיע לבילד release. */}
          {__DEV__ && (
            <Pressable
              style={[styles.btn, styles.btnDev, disabled && styles.btnDisabled]}
              onPress={signInWithDevDemoUser}
              disabled={disabled}
              accessibilityRole="button"
            >
              <Text style={styles.btnDevText}>{t('auth.devDemoLogin')}</Text>
            </Pressable>
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.legal}>{t('auth.legal')}</Text>
      </View>
    </SafeAreaView>
  );
}

// אותם path data בדיוק כמו GoogleMark/AppleMark ב-LoginScreen.tsx של
// הווב, react-native-svg ולא lucide, כי אלה סימני מותג רב-צבעוניים
// ולא אייקוני קו.
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </Svg>
  );
}

function AppleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 384 512" fill={colors.paper}>
      <Path d="M318.7 268c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C71.4 141.2 24 178.7 24 254.4c0 22.3 4.1 45.3 12.2 69 10.9 31.2 50.2 107.7 91.2 106.5 21.4-.5 36.5-15.2 64.4-15.2 27.1 0 41.1 15.2 64.9 15.2 41.4-.6 77-70.2 87.4-101.5-55.6-26.2-52.6-76.6-52.6-77.9zM255.3 91c30.4-36.1 27.6-68.9 26.7-80.7-26.8 1.6-57.8 18.3-75.5 38.9-19.4 22.1-30.8 49.4-28.3 78.8 29 2.2 55.5-12.7 77.1-37z" />
    </Svg>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s12,
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
  // כפתור dev בלבד, ראה __DEV__ למעלה. סגנון מכוון, ניכר שהוא כלי
  // פיתוח ולא נתיב כניסה אמיתי, כדי שלא יתבלבל עם גוגל/אפל.
  btnDev: {
    backgroundColor: colors.mist200,
    borderColor: colors.border200,
    borderStyle: 'dashed',
  },
  btnDevText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
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
