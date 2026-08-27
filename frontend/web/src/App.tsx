import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { t } from '@yevul/shared';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './screens/LoginScreen';
import { AppShell } from './shell/AppShell';
import { HomeScreen } from './screens/HomeScreen';
import { MoneyScreen } from './screens/MoneyScreen';
import { JournalScreen } from './screens/JournalScreen';
import { PlotsScreen } from './screens/PlotsScreen';
import { PlotDetailScreen } from './screens/PlotDetailScreen';
import { PlotFormScreen } from './screens/PlotFormScreen';
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

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="plots" element={<PlotsScreen />} />
        <Route path="plots/new" element={<PlotFormScreen />} />
        <Route path="plots/:plotId" element={<PlotDetailScreen />} />
        <Route path="plots/:plotId/edit" element={<PlotFormScreen />} />
        <Route path="money" element={<MoneyScreen />} />
        <Route path="journal" element={<JournalScreen />} />
        <Route path="spray-log" element={<SprayLogScreen />} />
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
