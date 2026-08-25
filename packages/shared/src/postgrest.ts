import type { PostgrestError } from '@supabase/supabase-js';

// כלל אחד במקום אחד: PostgREST לא מחזיר שגיאה כשמדיניות RLS חוסמת
// UPDATE, הוא מחזיר הצלחה עם אפס שורות (ה-USING clause פשוט לא תופס
// אף שורה). לעומת זאת INSERT שנחסם על ידי WITH CHECK כן זורק שגיאה
// אמיתית, כי שם מדובר בשורה חדשה שנפסלת ולא בשורה קיימת שלא נמצאה.
// הפונקציה הזו מטפלת בשני המקרים במקום אחד.
//
// חי כאן ולא ב-useFarmSettings, כי plots.ts זקוק לאותו כלל בדיוק,
// ומקום אחד מונע שני עותקים שיכולים להתפצל, בדיוק כמו שקרה לפני
// ביקורת הארכיטקטורה של שלב 2 עם טוקני העיצוב.
export type WriteOutcome = { ok: true } | { ok: false; reason: 'forbidden' | 'error' };

export function writeOutcome(result: {
  error: PostgrestError | null;
  data: unknown[] | null;
}): WriteOutcome {
  if (result.error) return { ok: false, reason: 'error' };
  if (!result.data || result.data.length === 0) return { ok: false, reason: 'forbidden' };
  return { ok: true };
}
