import type { SupabaseClient } from '@supabase/supabase-js';

// שם התצוגה של המשתמש, נשמר ב-user_metadata של Supabase Auth ולא
// בטבלה, ולכן אין כאן מיגרציה. משותף לנייד ולווב באותו דפוס כמו
// useAuthSession: הלקוח מעביר את ה-client כפרמטר ואינו מייבא אותו,
// כדי שהקוד יישאר חסר תלות בסביבה.
//
// הקריאה מעדיפה display_name שהמשתמש הגדיר בעצמו, ונופלת חזרה לשם
// שסיפק ספק הזהות (Google/Apple) ב-full_name או name, כדי שברכה עם
// שם תופיע כבר בכניסה הראשונה עוד לפני שהמשתמש ערך משהו.

// טיפוס רופף בכוונה: מקבל את אובייקט המשתמש של Supabase, אבל נשען רק
// על user_metadata, כדי שלא ייקשר לצורת ה-User המלאה של ה-SDK.
type UserLike = { user_metadata?: Record<string, unknown> } | null | undefined;

// מנקה ערך מ-metadata: מחרוזת חתוכה ולא ריקה, אחרת null. כך "  " נחשב
// חסר ונופלים למקור הבא, ולא מציגים ברכה עם רווחים בלבד.
function cleaned(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function resolveDisplayName(user: UserLike): string | null {
  const meta = user?.user_metadata;
  if (!meta) return null;
  return cleaned(meta.display_name) ?? cleaned(meta.full_name) ?? cleaned(meta.name);
}

// כתיבה ל-user_metadata. auth.updateUser לא זורק כשהוא נכשל, הוא
// מחזיר error בתוך התוצאה, בדיוק כמו PostgREST ב-writeOutcome, ולכן
// בודקים אותו כאן ומחזירים תוצאה בוליאנית פשוטה שהמסך מדווח עליה.
export async function updateDisplayName(
  supabase: SupabaseClient,
  value: string,
): Promise<{ ok: boolean }> {
  const { error } = await supabase.auth.updateUser({ data: { display_name: value.trim() } });
  return { ok: !error };
}
