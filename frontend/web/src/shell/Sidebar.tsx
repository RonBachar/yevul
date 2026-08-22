import { NavLink } from 'react-router-dom';
import { House, LayoutGrid, NotebookPen, Settings, Wallet } from 'lucide-react';
import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// ניווט הצד של לקוח הווב. זו הפריסה שמחליפה את שורת הטאבים של הנייד,
// לא מתיחה שלה. הנימוקים המלאים מתועדים ב-docs/design.md, סעיף
// Web Client Shell.
//
// היעדים נגזרים מ-prd.md סעיף 12, מה שהווב באמת עושה. אין כאן כפתור
// רישום מרכזי, כי קול, סבב וצילום מהיר הוגדרו כנייד בלבד.
const destinations = [
  { to: '/', Icon: House, key: 'web.nav.home', end: true },
  { to: '/plots', Icon: LayoutGrid, key: 'web.nav.plots', end: false },
  { to: '/money', Icon: Wallet, key: 'web.nav.money', end: false },
  { to: '/journal', Icon: NotebookPen, key: 'web.nav.journal', end: false },
  { to: '/settings', Icon: Settings, key: 'web.nav.settings', end: false },
];

export function Sidebar() {
  const { session } = useAuth();
  const email = session?.user.email ?? session?.user.id ?? '';

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <nav className="sidebar" aria-label={t('web.nav.sectionMain')}>
      <div className="sidebar__brand">{t('app.name')}</div>

      <ul className="sidebar__list">
        {destinations.map(({ to, Icon, key, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
              }
            >
              <Icon size={24} strokeWidth={2} aria-hidden="true" />
              <span>{t(key)}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar__account">
        <span className="sidebar__email" title={email}>
          {email}
        </span>
        <button type="button" className="sidebar__signout" onClick={signOut}>
          {t('shell.signOut')}
        </button>
      </div>
    </nav>
  );
}
