import { describe, expect, it } from 'vitest';
import { normalizeTaskTitle, taskDueDisplay } from './tasks';

// TaskCostMemory מתאים משימות לפי כותרת מנורמלת. prd.md: "בפעם הבאה
// שהוא פותח משימה עם אותה כותרת השדה כבר מלא". "אותה כותרת" בעיני
// חקלאי סובלת רווחים כפולים ורישיות שונות, לא רק התאמת מחרוזת מדויקת.
describe('normalizeTaskTitle', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeTaskTitle('  ריסוס עשבייה  ')).toBe('ריסוס עשבייה');
  });

  it('collapses repeated internal whitespace to a single space', () => {
    expect(normalizeTaskTitle('ריסוס   עשבייה')).toBe('ריסוס עשבייה');
  });

  it('treats different casing of a Latin substring as the same title', () => {
    expect(normalizeTaskTitle('Spray RoundUp')).toBe(normalizeTaskTitle('spray roundup'));
  });

  it('normalizes an empty or whitespace-only title to the empty string', () => {
    expect(normalizeTaskTitle('')).toBe('');
    expect(normalizeTaskTitle('   ')).toBe('');
  });

  it('leaves two genuinely different titles distinct', () => {
    expect(normalizeTaskTitle('ריסוס עשבייה')).not.toBe(normalizeTaskTitle('דישון'));
  });
});

// **האות היחיד שנשאר.** עד 2026-09-25 הדחיפות הופיעה גם ככותרות קבוצה
// על הלוח, ולקבוצות היו בדיקות משלהן. הכותרות והקיבוץ נמחקו, הלוח הוא
// רשימה אחת מהחדשה לישנה, ומה שמספר לחקלאי שמשימה בוערת הוא הטקסט הזה
// והגוון הזה על השורה עצמה. אם הם יישברו, שום דבר אחר במסך לא יסגיר זאת.
describe('taskDueDisplay', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('has nothing to show for a task with no due date', () => {
    expect(taskDueDisplay(null, now)).toBeNull();
  });

  it('marks a past date overdue and counts the days', () => {
    const due = taskDueDisplay('2026-08-20', now);
    expect(due?.tone).toBe('overdue');
    expect(due?.text).toContain('5');
  });

  it('reads today and tomorrow as words, not dates', () => {
    expect(taskDueDisplay('2026-08-25', now)?.tone).toBe('today');
    expect(taskDueDisplay('2026-08-26', now)?.tone).toBe('tomorrow');
  });

  it('counts the days for a date inside the coming week', () => {
    expect(taskDueDisplay('2026-08-30', now)?.tone).toBe('soon');
  });

  // הבאג שהצדיק בזמנו את קבוצת "בהמשך": בלי הענף הזה כל תאריך עתידי,
  // גם בעוד חודשיים, נקרא כאילו הוא בשבוע הקרוב. הקבוצה נמחקה, הענף לא.
  it('shows an explicit date more than a week out, not a countdown', () => {
    const far = taskDueDisplay('2026-10-17', now);
    expect(far?.tone).toBe('later');
    expect(far?.text).toContain('17');
  });
});
