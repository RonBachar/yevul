import { describe, expect, it } from 'vitest';
import { normalizeTaskTitle } from './tasks';

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
