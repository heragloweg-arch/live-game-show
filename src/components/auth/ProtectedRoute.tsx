import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { sessionLoading, isAuthenticated, user, isAnonymousSession } = useAuthStore();

  if (sessionLoading) {
    return <div className="route-loading" dir="rtl"><span className="boot-progress" /><p>نتحقق من جلستك الآمنة…</p></div>;
  }

  // Anonymous Supabase sessions are deliberately not accepted for the production app.
  if (!isAuthenticated || !user || isAnonymousSession) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
