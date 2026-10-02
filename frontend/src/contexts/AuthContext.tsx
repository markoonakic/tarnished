import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
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
    } catch {
      // Sign-in can continue if the setup check is unavailable.
    }

    if (!isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/api/auth/me');
      setUser(response.data);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    logout();
    setUser(null);
  };

  useEffect(() => {
    refreshUser();
  }, []);

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
