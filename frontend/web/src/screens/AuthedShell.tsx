import type { Session } from '@supabase/supabase-js';
import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import './AuthedShell.css';

// שלד מאומת זמני. הפריסה האמיתית של שולחן העבודה נבנית במשימת "שלד
// לקוח ווב" בהמשך שלב 2. כאן רק מוכיחים שהסשן קיים ושהתנתקות עובדת.
export function AuthedShell({ session }: { session: Session }) {
  const email = session.user.email ?? session.user.id;

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <main className="shell">
      <header className="shell__bar">
        <span className="shell__title">{t('app.name')}</span>
        <button type="button" className="shell__signout" onClick={signOut}>
          {t('shell.signOut')}
        </button>
      </header>
      <section className="shell__body">
        <p className="shell__meta">
          {t('shell.signedInAs')} <strong>{email}</strong>
        </p>
        <p className="shell__placeholder">{t('shell.placeholder')}</p>
      </section>
    </main>
  );
}
