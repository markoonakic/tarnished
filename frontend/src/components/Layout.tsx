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
    return isActive(path) ? 'text-aqua-bright' : 'text-fg1 hover:text-aqua-bright transition-colors duration-200';
  }

  return (
    <div className="min-h-screen bg-primary">
      <nav className="bg-secondary border-b border-tertiary">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-aqua focus:text-bg0 focus:rounded"
        >
          Skip to main content
        </a>
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-fg1 hover:text-aqua-bright transition-colors duration-200">
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
              className="px-4 py-2 bg-bg1 text-fg1 rounded hover:bg-bg2 hover:text-fg0 transition-all duration-200"
            >
              Sign Out
            </button>
          </div>
        </div>
       </nav>
      <main id="main-content">
        {children}
      </main>
    </div>
  );
}
