import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { House, LayoutGrid, Menu, NotebookPen, Settings, Wallet, X } from 'lucide-react';
// ה-barrel תקין כאן, Rollup מבצע tree shaking בבנייה של Vite.
import { t, useMyRole, workerModeShell } from '@yevul/shared';
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
  // Worker Mode, שלב 6, design.md, Web Client Shell: "the web sidebar nav must
  // drop the כסף destination for a worker" (לווב אין שורת טאבים תחתונה ולא
  // כפתור רישום). ההחלטה טהורה ב-workerModeShell, וההסתרה כאן היא נוחות
  // בלבד, ה-route עצמו שומר על עצמו ב-App.tsx וה-RLS חוסם את נתוני הכסף.
  // עד שהתפקיד ידוע הכסף מוסתר, כדי שעובד לא יראה את היעד אפילו לפריים.
  const role = useMyRole(supabase);
  const shell = workerModeShell(role.role, role.loading);
  const visibleDestinations = destinations.filter((d) => d.to !== '/money' || shell.showMoney);
  const [signOutFailed, setSignOutFailed] = useState(false);
  // תפריט הסנדוויץ' של הנייד בלבד. בדסקטופ הניווט הוא הסיידבר הקבוע
  // והתפריט הזה מוסתר לגמרי ב-CSS, ולכן ה-state כאן לא משפיע עליו.
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const email = session?.user.email ?? session?.user.id ?? '';

  // כשל בהתנתקות מוצג ולא נבלע. קודם ה-await היה בלי catch, כך
  // שרשת גרועה הפילה את ההבטחה בשקט והמשתמש נשאר מחובר בלי לדעת.
  async function signOut() {
    setSignOutFailed(false);
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutFailed(true);
  }

  // Escape סוגר את התפריט הנייד ומחזיר פוקוס לכפתור הפתיחה, ופתיחה
  // מעבירה פוקוס לפריט הראשון בפאנל כדי שגלישה במקלדת תיכנס פנימה.
  // הכל תלוי ב-menuOpen בלבד, ולכן הרשימה כאן מלאה ואין תלות חסרה.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // רשימת היעדים והבלוק החשבון מוגשים גם בסיידבר וגם בתפריט הנייד,
  // אותו טיפול חזותי בדיוק. onClick סוגר את התפריט; בדסקטופ הוא כבר
  // סגור ולכן זה no-op.
  const renderNavItems = () =>
    visibleDestinations.map(({ to, Icon, key, end }) => (
      <li key={to}>
        <NavLink
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
          }
        >
          <Icon size={24} strokeWidth={2} aria-hidden="true" />
          <span>{t(key)}</span>
        </NavLink>
      </li>
    ));

  const renderAccount = () => (
    <div className="sidebar__account">
      <span className="sidebar__email" title={email}>
        {email}
      </span>
      <button type="button" className="sidebar__signout" onClick={signOut}>
        {t('shell.signOut')}
      </button>
      {signOutFailed && (
        <span className="sidebar__error" role="alert">
          {t('shell.signOutError')}
        </span>
      )}
    </div>
  );

  return (
    <>
      {/* דסקטופ: ניווט צד קבוע. מוסתר מתחת ל-700 (ראה shell.css). */}
      <nav className="sidebar" aria-label={t('web.nav.sectionMain')}>
        <div className="sidebar__brand">{t('app.name')}</div>
        <ul className="sidebar__list">{renderNavItems()}</ul>
        {renderAccount()}
      </nav>

      {/* נייד: פס עליון דק. כפתור הסנדוויץ' בצד המוביל (ימין ב-RTL) לפי
          בקשת היזם, והמותג בצד הנגדי. מוסתר מעל 700. */}
      <div className="shell-topbar">
        <button
          ref={toggleRef}
          type="button"
          className="shell-topbar__toggle"
          aria-label={t('web.nav.menu')}
          aria-expanded={menuOpen}
          aria-controls="shell-nav-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <X size={28} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Menu size={28} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
        <span className="shell-topbar__brand">{t('app.name')}</span>
      </div>

      {/* נייד: תפריט שנפתח בהחלקה מלמעלה. הפאנל מרונדר תמיד כדי לאפשר
          אנימציה; visibility:hidden מוציא אותו מסדר ה-Tab כשסגור (shell.css). */}
      <div className={menuOpen ? 'shell-menu shell-menu--open' : 'shell-menu'}>
        <div
          className="shell-menu__scrim"
          aria-hidden="true"
          onClick={() => {
            setMenuOpen(false);
            toggleRef.current?.focus();
          }}
        />
        <nav
          ref={panelRef}
          id="shell-nav-menu"
          className="shell-menu__panel"
          aria-label={t('web.nav.sectionMain')}
        >
          <ul className="sidebar__list">{renderNavItems()}</ul>
          {renderAccount()}
        </nav>
      </div>
    </>
  );
}
