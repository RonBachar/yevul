import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// לקוח Supabase יחיד ללקוח הנייד. ה-anon key מותר בבאנדל, RLS מגן על
// הנתונים בפועל. שום מפתח סודי לא נכנס לכאן, אלה חיים רק ב-Worker.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'חסרים EXPO_PUBLIC_SUPABASE_URL או EXPO_PUBLIC_SUPABASE_ANON_KEY, ראה docs/env.md',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // הסשן נשמר ב-AsyncStorage של המכשיר, לא ב-URL
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // PKCE, זרימת ה-OAuth הבטוחה לנייד, מאפשרת exchangeCodeForSession
    flowType: 'pkce',
  },
});

// רענון טוקן אוטומטי רק כשהאפליקציה בחזית, לפי המלצת Supabase לנייד.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
