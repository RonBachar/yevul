import type { CsvReport } from '@yevul/shared';

// הורדת קובץ בדפדפן. חי בווב ולא ב-packages/shared, כי הוא נוגע
// ב-Blob, ב-URL וב-document, ולפי prd.md סעיף 12 ייצוא הדוחות הוא
// פיצ'ר ווב בלבד ממילא. הבנייה של תוכן הקובץ עצמו נשארת ב-shared
// ובדוקה שם (reports.ts), וכאן יושבת רק ההגשה למשתמש.
//
// שם הקובץ נושא תאריך, כי רואה חשבון מקבל את אותו דוח כמה פעמים
// בשנה ו-"expenses.csv" פעמיים בתיקיית ההורדות הוא בלבול מובטח.
export function downloadCsv(report: CsvReport, farmName: string | null): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = farmName?.trim() ? `${farmName.trim()}-` : '';
  const filename = `${prefix}${report.filename}-${stamp}.csv`;

  // text/csv עם charset מפורש. ה-BOM שנכתב ב-toCsv הוא מה שגורם
  // לאקסל לזהות UTF-8, וה-charset כאן הוא החגורה השנייה.
  const blob = new Blob([report.csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // שחרור ה-object URL. בלעדיו כל ייצוא משאיר את תוכן הקובץ בזיכרון
  // הלשונית עד לרענון.
  URL.revokeObjectURL(url);
}
