import { useState } from 'react';
import type { Provider } from '@supabase/supabase-js';
import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import './LoginScreen.css';

// מסך התחברות. שני נתיבי כניסה, גוגל ואפל. הלקוח רק פותח את זרימת
// ה-OAuth של Supabase, כל האימות קורה בשרת. אחרי חזרה מוצלחת, הטריגר
// on_auth_user_created כבר דאג למשק, הלקוח לא יוצר כלום.
export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);

  async function signInWith(provider: Provider) {
    setError(null);
    setPending(provider);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (authError) {
        setError(t('auth.error'));
        setPending(null);
      }
      // בהצלחה הדפדפן מנווט לספק, אין צורך לאפס pending
    } catch {
      setError(t('auth.error'));
      setPending(null);
    }
  }

  return (
    <main className="login">
      <div className="login__card">
        <div className="login__brand">
          <span className="login__logomark" aria-hidden="true">
            🌱
          </span>
          <h1 className="login__title">{t('app.name')}</h1>
          <p className="login__tagline">{t('auth.tagline')}</p>
        </div>

        <div className="login__actions">
          <button
            type="button"
            className="login__btn login__btn--google"
            onClick={() => signInWith('google')}
            disabled={pending !== null}
          >
            <GoogleMark />
            <span>{t('auth.continueWithGoogle')}</span>
          </button>

          <button
            type="button"
            className="login__btn login__btn--apple"
            onClick={() => signInWith('apple')}
            disabled={pending !== null}
          >
            <AppleMark />
            <span>{t('auth.continueWithApple')}</span>
          </button>
        </div>

        {error ? (
          <p className="login__error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="login__legal">{t('auth.legal')}</p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg className="login__icon" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className="login__icon" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C71.4 141.2 24 178.7 24 254.4c0 22.3 4.1 45.3 12.2 69 10.9 31.2 50.2 107.7 91.2 106.5 21.4-.5 36.5-15.2 64.4-15.2 27.1 0 41.1 15.2 64.9 15.2 41.4-.6 77-70.2 87.4-101.5-55.6-26.2-52.6-76.6-52.6-77.9zM255.3 91c30.4-36.1 27.6-68.9 26.7-80.7-26.8 1.6-57.8 18.3-75.5 38.9-19.4 22.1-30.8 49.4-28.3 78.8 29 2.2 55.5-12.7 77.1-37z" />
    </svg>
  );
}
