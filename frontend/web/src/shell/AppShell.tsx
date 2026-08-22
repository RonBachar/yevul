import { Outlet } from 'react-router-dom';
import { t } from '@yevul/shared';
import { Sidebar } from './Sidebar';
import './shell.css';

// פריסת שולחן העבודה, ניווט צד קבוע ואזור תוכן. הניווט יושב בצד ימין
// כי המסמך כולו RTL, וזה נובע מ-direction ולא ממיקום ידני.
export function AppShell() {
  return (
    <div className="shell">
      <a className="shell__skip" href="#content">
        {t('web.skipToContent')}
      </a>
      <Sidebar />
      <main className="shell__content" id="content">
        <Outlet />
      </main>
    </div>
  );
}
