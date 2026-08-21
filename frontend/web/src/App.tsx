import { t } from '@yevul/shared';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './screens/LoginScreen';
import { AuthedShell } from './screens/AuthedShell';

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">{t('common.loading')}</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <AuthedShell session={session} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
