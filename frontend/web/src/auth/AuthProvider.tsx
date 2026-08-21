import { createContext, useContext, type ReactNode } from 'react';
import { useAuthSession, type AuthState } from '@yevul/shared';
import { supabase } from '../lib/supabase';

// עוטף את הוק מעקב הסשן המשותף (packages/shared) בקונטקסט React, כדי
// שכל הלקוח יקרא מצב אימות אחד. לוגיקת הסשן עצמה חיה במקום אחד,
// משותפת עם frontend/mobile, כדי לא לשכפל אותה בין הפלטפורמות.
const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthSession(supabase);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
