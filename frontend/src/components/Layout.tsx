import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { user, signOut } = useAuth();
  const location = useLocation();

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  function linkClass(path: string) {
    return isActive(path) ? 'text-accent-aqua' : 'text-primary hover:text-accent-aqua';
  }

  return (
    <div className="min-h-screen bg-primary">
      <nav className="bg-secondary border-b border-tertiary">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-accent-aqua">
              Job Tracker
            </Link>
            <Link to="/applications" className={linkClass('/applications')}>
              Applications
            </Link>
            <Link to="/analytics" className={linkClass('/analytics')}>
              Analytics
            </Link>
            <Link to="/settings" className={linkClass('/settings')}>
              Settings
            </Link>
            {user?.is_admin && (
              <Link to="/admin" className={linkClass('/admin')}>
                Admin
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted">{user?.email}</span>
            <button
              onClick={signOut}
              className="px-3 py-1 rounded bg-tertiary text-primary hover:opacity-80 text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
