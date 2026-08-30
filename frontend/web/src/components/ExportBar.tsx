import { Download, Printer } from 'lucide-react';
import { t, type CsvReport } from '@yevul/shared';
import { downloadCsv } from '../lib/download';
import './ExportBar.css';

// סרגל הייצוא, שלב 4. prd.md סעיף 12: הדוחות והייצוא הם פיצ'ר ווב
// בלבד, ולכן אין לרכיב הזה תאום בנייד.
//
// מוצג בשלושת המקומות שה-PRD וה-design.md ממקמים בהם ייצוא, ולא
// במסך דוחות נפרד: מסך הכסף (רווחיות והוצאות), היומן (יומן מלא),
// ומסך יומן הריסוס (ייצוא לרגולטור). design.md, Spray Log Screen,
// מפרט שם במפורש "כפתור ייצוא אחד גדול".
//
// **הכפתורים עצמם מוסתרים בהדפסה** (print-hide), כי הם כרום ולא
// תוכן, ואין להם מה לעשות על הדף שנשמר כ-PDF.

export type ExportAction = { label: string; build: () => CsvReport };

export function ExportBar({
  actions,
  farmName,
  showPrint = true,
}: {
  actions: ExportAction[];
  farmName: string | null;
  showPrint?: boolean;
}) {
  return (
    <section className="export-bar print-hide">
      <h2 className="export-bar__title">{t('report.sectionTitle')}</h2>
      <div className="export-bar__actions">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="export-bar__button"
            onClick={() => downloadCsv(action.build(), farmName)}
          >
            <Download size={18} strokeWidth={2} aria-hidden="true" />
            {action.label}
          </button>
        ))}
        {/* ה-PDF של המוצר. הדפדפן מרנדר, ולכן עברית ו-RTL נכונים
            בהגדרה ובלי תלות חדשה. ראה styles/print.css. */}
        {showPrint && (
          <button
            type="button"
            className="export-bar__button export-bar__button--ghost"
            onClick={() => window.print()}
          >
            <Printer size={18} strokeWidth={2} aria-hidden="true" />
            {t('report.print')}
          </button>
        )}
      </div>
    </section>
  );
}
