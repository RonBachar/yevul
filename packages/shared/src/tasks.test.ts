import { describe, expect, it } from 'vitest';
import { groupTasksByUrgency, normalizeTaskTitle, type Task } from './tasks';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'id',
    farmId: 'farm',
    plotId: null,
    title: 'משימה',
    dueDate: null,
    estimatedCost: null,
    completedAt: null,
    snoozedUntil: null,
    snoozeCount: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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

// באג שנתפס בבדיקה בפועל: כל תאריך עתידי שהוא לא "מחר" נפל תחת "השבוע",
// גם משימה עם עד-תאריך בעוד חודשים. "later" היא קבוצה נפרדת לכל דבר
// שמעבר לשבוע קדימה.
describe('groupTasksByUrgency', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('puts a due date more than a week out under "later", not "week"', () => {
    const task = makeTask({ id: 'far', dueDate: '2026-10-17' });
    const groups = groupTasksByUrgency([task], now);
    const later = groups.find((group) => group.key === 'later');
    const week = groups.find((group) => group.key === 'week');
    expect(later?.tasks.map((t) => t.id)).toEqual(['far']);
    expect(week).toBeUndefined();
  });

  it('keeps a due date within the next week under "week"', () => {
    const task = makeTask({ id: 'soon', dueDate: '2026-08-30' });
    const groups = groupTasksByUrgency([task], now);
    const week = groups.find((group) => group.key === 'week');
    expect(week?.tasks.map((t) => t.id)).toEqual(['soon']);
  });

  it('omits empty groups', () => {
    const task = makeTask({ id: 'today', dueDate: '2026-08-25' });
    const groups = groupTasksByUrgency([task], now);
    expect(groups.map((group) => group.key)).toEqual(['today']);
  });
});
