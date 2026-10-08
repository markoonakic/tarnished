import { useTranslation } from 'react-i18next';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { observeRead } from '../lib/queryClient';
import { isAuthenticated, logout } from '../lib/auth';
import type { User } from '../lib/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const setupResponse = await api.get('/api/auth/setup-status');
      if (setupResponse.data.needs_setup) {
        setUser(null);
        if (!['/register', '/login'].includes(window.location.pathname)) {
          window.location.href = '/register?setup=true';
          return;
        }
        setLoading(false);
        return;
      }
    } catch (error) {
      // Sign-in stays available, but keep checking setup after an outage.
      if (!isAuthenticated()) setLoading(false);
      return { error };
    }

    if (!isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/api/auth/me');
      setUser(response.data);
      setLoading(false);
    } catch (error) {
      // Only the authentication flow can reject a session. An outage is not logout.
      if (!isAuthenticated()) setLoading(false);
      return { error };
    }
  };

  const refreshUser = async () => {
    await loadUser();
  };

  const signOut = () => {
    logout();
    setUser(null);
  };

  useEffect(() => observeRead(loadUser), []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
