import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import * as authService from '../services/auth.service';
import type { AppUser, Role, SignupInput } from '../services/auth.service';

export type { AppUser, Role };

interface AuthValue {
  currentUser: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const sync = async (session: { user: { id: string; email?: string } } | null) => {
      if (!session?.user) { if (active) { setCurrentUser(null); setLoading(false); } return; }
      const profile = await authService.fetchProfile(session.user.id, session.user.email ?? '');
      if (active) { setCurrentUser(profile); setLoading(false); }
    };

    supabase.auth.getSession().then(({ data }) => sync(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { sync(session); });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const value: AuthValue = {
    currentUser,
    loading,
    login: authService.signIn,
    signup: authService.signUp,
    logout: async () => { await authService.signOut(); setCurrentUser(null); },
    requestPasswordReset: authService.requestPasswordReset,
    resetPassword: authService.updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
