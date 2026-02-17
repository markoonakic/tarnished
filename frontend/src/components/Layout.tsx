import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  function linkClass(path: string) {
    return isActive(path) ? 'text-accent-bright' : 'text-accent hover:text-accent-bright transition-all duration-200 ease-in-out';
  }

  function mobileLinkClass(path: string) {
    return `block py-3 ${linkClass(path)}`;
  }

  return (
    <div className="min-h-screen bg-primary">
      <nav className="bg-secondary border-b border-tertiary" ref={menuRef}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-bg0 focus:rounded"
        >
          Skip to main content
        </a>
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-fg1 hover:text-accent-bright transition-all duration-200 ease-in-out">
              <div className="h-8 w-8 bg-current [mask-image:url('/tree.svg')] [mask-size:contain] [mask-repeat:no-repeat] [mask-position:center] transition-all duration-200 ease-in-out" />
              Tarnished
            </Link>
            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-6">
              <Link to="/job-leads" className={linkClass('/job-leads')}>
                Job Leads
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
          </div>
          {/* Desktop user area */}
          <div className="hidden md:flex items-center gap-4">
            <span className="text-muted">{user?.email}</span>
            <button
              onClick={signOut}
              className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md cursor-pointer"
            >
              Sign Out
            </button>
          </div>
          {/* Mobile hamburger button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out rounded cursor-pointer"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <i className={`bi-${menuOpen ? 'x-lg' : 'list'} icon-lg`} />
          </button>
        </div>
        {/* Mobile menu panel */}
        <div
          className="md:hidden border-t border-tertiary transition-all duration-200 ease-in-out"
          style={{
            display: 'grid',
            gridTemplateRows: menuOpen ? '1fr' : '0fr',
            opacity: menuOpen ? 1 : 0,
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            <div className="px-4 pb-4">
              <Link to="/job-leads" className={mobileLinkClass('/job-leads')}>
                Job Leads
              </Link>
              <Link to="/applications" className={mobileLinkClass('/applications')}>
                Applications
              </Link>
              <Link to="/analytics" className={mobileLinkClass('/analytics')}>
                Analytics
              </Link>
              <Link to="/settings" className={mobileLinkClass('/settings')}>
                Settings
              </Link>
              {user?.is_admin && (
                <Link to="/admin" className={mobileLinkClass('/admin')}>
                  Admin
                </Link>
              )}
              <div className="border-t border-tertiary mt-2 pt-3 pb-2">
                <span className="text-muted text-sm block mb-3">{user?.email}</span>
                <button
                  onClick={signOut}
                  className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md cursor-pointer w-full text-left"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
       </nav>
      <main id="main-content">
        {children}
      </main>
    </div>
  );
}
