import { createClient } from '@supabase/supabase-js';

// לקוח Supabase יחיד ללקוח הווב. ה-anon key מותר בבאנדל, RLS מגן על
// הנתונים בפועל ולא הסתרת המפתח. שום מפתח סודי (service_role, OpenRouter,
// RevenueCat) לא נכנס לכאן, אלה חיים רק ב-Worker.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('חסרים VITE_SUPABASE_URL או VITE_SUPABASE_ANON_KEY, ראה docs/env.md');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // מזהה חזרה מ-OAuth דרך פרמטרים ב-URL אחרי redirect
    detectSessionInUrl: true,
  },
});

// עזר פיתוח בלבד: חושף את הלקוח לקונסולה כדי לבדוק זרימות אימות
// מקומית (למשל signInWithPassword מול משתמש ה-seed) לפני שספקי OAuth
// מוגדרים. לא קיים בבאנדל של פרודקשן.
if (import.meta.env.DEV) {
  (globalThis as unknown as { supabase: typeof supabase }).supabase = supabase;
}
