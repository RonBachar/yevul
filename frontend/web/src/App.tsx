import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { t, useMyRole, workerModeShell } from '@yevul/shared';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { supabase } from './lib/supabase';
import { LoginScreen } from './screens/LoginScreen';
import { AppShell } from './shell/AppShell';
import { HomeScreen } from './screens/HomeScreen';
import { MoneyScreen } from './screens/MoneyScreen';
import { JournalScreen } from './screens/JournalScreen';
import { PlotsScreen } from './screens/PlotsScreen';
import { PlotDetailScreen } from './screens/PlotDetailScreen';
import { PlotFormScreen } from './screens/PlotFormScreen';
import { PricelistScreen } from './screens/PricelistScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SprayLogScreen } from './screens/SprayLogScreen';

// ניתוב אמיתי עם כתובות, ולא החלפת מסכים לפי state. בווב הכתובת היא
// חלק מהמוצר, סימנייה, כפתור אחורה של הדפדפן, ושיתוף קישור לחלקה
// מסוימת בהמשך. זה ההבדל המרכזי מהנייד ולכן זו לא כפילות של הניווט שם.
function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">{t('common.loading')}</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <AuthedRoutes />;
}

// הניתובים של המשתמש המאומת. useMyRole נקרא כאן ולא ב-Gate, אחרי בדיקת
// הסשן, כדי שההוק לא ירוץ במסך הכניסה ולא יפר את סדר ההוקים.
//
// **Worker Mode, שלב 6, design.md:** לעובד אין יעד "כסף", ואין לו גם
// מחירון, שהוא טבלת כסף שה-RLS חוסם ממנו ממילא (owner/manager בלבד,
// ראה 20260904130000_spray_pricelist.sql). ה-routes עצמם שמורים מאחורי
// שומר תפקיד ולא רק מוסתרים מהסרגל: עובד שמקליד את הכתובת ידנית מנותב
// לבית. בזמן שהתפקיד עדיין נטען מציגים טעינה במקום לנתב, כדי שבעל משק
// שנכנס ישירות לכתובת (סימנייה) לא ייזרק לבית לפני שהתפקיד הוכרע.
function AuthedRoutes() {
  const role = useMyRole(supabase);
  const shell = workerModeShell(role.role, role.loading);

  const ownerOnly = (element: ReactNode): ReactNode => {
    if (shell.showMoney) return element;
    if (shell.isWorker) return <Navigate to="/" replace />;
    return <div className="app-loading">{t('common.loading')}</div>;
  };

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="plots" element={<PlotsScreen />} />
        <Route path="plots/new" element={<PlotFormScreen />} />
        <Route path="plots/:plotId" element={<PlotDetailScreen />} />
        <Route path="plots/:plotId/edit" element={<PlotFormScreen />} />
        <Route path="money" element={ownerOnly(<MoneyScreen />)} />
        <Route path="journal" element={<JournalScreen />} />
        <Route path="spray-log" element={<SprayLogScreen />} />
        <Route path="pricelist" element={ownerOnly(<PricelistScreen />)} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>
      {/* כתובת לא מוכרת חוזרת לבית, במקום מסך ריק בלי ניווט */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
