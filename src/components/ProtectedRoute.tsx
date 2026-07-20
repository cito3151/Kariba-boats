import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, type Role } from '../data/AuthContext';
import { LoadingState } from './StateViews';

export default function ProtectedRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session" />;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allow.includes(currentUser.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
