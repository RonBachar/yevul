import { useEffect, useMemo, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

// מצב האימות. הלקוח רק קורא את הסשן ומציג בהתאם, הוא לא מחליט הרשאות,
// ההרשאות נאכפות ב-RLS בשרת. הוק טהור, בלי תלות בסביבה, כדי שמובייל
// ווב ישתפו את אותה לוגיקת מעקב סשן בלי לשכפל אותה, בדיוק כמו i18n.
export type AuthState = {
  session: Session | null;
  loading: boolean;
};

export function useAuthSession(supabase: SupabaseClient): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return useMemo(() => ({ session, loading }), [session, loading]);
}
