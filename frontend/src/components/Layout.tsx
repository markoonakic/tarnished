import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from '@/lib/i18n';
import TasksBadge from './TasksBadge';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  useTranslation();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const navigation = [
    { path: '/job-leads', label: t('Job Leads') },
    { path: '/applications', label: t('Applications') },
    { path: '/companies', label: t('kit.companies') },
    { path: '/tasks', label: t('kit.tasks') },
    { path: '/analytics', label: t('Analytics') },
  ];
  const accountItems = [
    { path: '/profile', label: t('Profile'), icon: 'bi-person' },
    { path: '/settings', label: t('Settings'), icon: 'bi-gear' },
    ...(user?.is_admin
      ? [{ path: '/admin', label: t('Admin'), icon: 'bi-shield-lock' }]
      : []),
  ];
  const accountName = user?.display_name || user?.email;

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen && !accountOpen) return;
    function outside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        (accountOpen ? accountButton : mobileButton).current?.focus();
        setAccountOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen, accountOpen]);
  function linkClass(path: string) {
    return (path === '/companies' &&
      location.pathname.startsWith('/contacts')) ||
      (path === '/tasks' && location.pathname.startsWith('/interviews/')) ||
      location.pathname === path ||
      location.pathname.startsWith(path + '/')
      ? 'text-accent-bright'
      : 'text-accent hover:text-accent-bright transition-all duration-200 ease-in-out';
  }
  return (
    <div className="bg-primary min-h-screen">
      <nav className="bg-secondary border-tertiary border-b" ref={menuRef}>
        <a
          href="#main-content"
          className="focus:bg-accent focus:text-bg0 sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:px-4 focus:py-2"
        >
          {t('Skip to main content')}
        </a>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-fg1 hover:text-accent-bright flex items-center gap-2 text-xl font-bold transition-all duration-200 ease-in-out"
            >
              <div className="h-8 w-8 bg-current [mask-image:url('/tree.svg')] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]" />
              Tarnished
            </Link>
            <div className="hidden items-center gap-6 whitespace-nowrap xl:flex">
              {navigation.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center ${linkClass(item.path)}`}
                >
                  {item.label}
                  {item.path === '/tasks' && <TasksBadge />}
                </Link>
              ))}
            </div>
          </div>
          <div className="relative hidden min-w-0 xl:block">
            <button
              ref={accountButton}
              onClick={() => setAccountOpen(!accountOpen)}
              aria-expanded={accountOpen}
              aria-controls="account-links"
              className="text-fg1 hover:bg-bg2 focus:ring-accent-bright flex max-w-64 cursor-pointer items-center gap-2 rounded-md px-3 py-2 focus:ring-2"
            >
              <span className="truncate" title={accountName}>
                {accountName}
              </span>
              <i className="bi-chevron-down icon-sm" aria-hidden="true" />
            </button>
            {accountOpen && (
              <div
                id="account-links"
                aria-label={t('Account menu')}
                className="bg-secondary border-tertiary absolute right-0 z-50 mt-2 w-60 rounded-lg border p-2 shadow-lg"
              >
                {accountItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="text-fg1 hover:bg-bg2 focus:ring-accent-bright flex items-center gap-2 rounded px-3 py-2 focus:ring-2"
                  >
                    <i className={item.icon} aria-hidden="true" />
                    {item.label}
                  </Link>
                ))}
                <hr className="border-tertiary my-2" />
                <button
                  onClick={signOut}
                  className="text-fg1 hover:bg-bg2 focus:ring-accent-bright flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left focus:ring-2"
                >
                  <i className="bi-box-arrow-right" aria-hidden="true" />
                  {t('Sign out')}
                </button>
              </div>
            )}
          </div>
          <button
            ref={mobileButton}
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-fg1 hover:bg-bg2 focus:ring-accent-bright cursor-pointer rounded p-2 focus:ring-2 xl:hidden"
            aria-label={t('Toggle menu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            <i
              className={`bi-${menuOpen ? 'x-lg' : 'list'} icon-lg`}
              aria-hidden="true"
            />
          </button>
        </div>
        <div
          inert={!menuOpen}
          aria-hidden={!menuOpen}
          hidden={!menuOpen}
          id="mobile-navigation"
          className="border-tertiary border-t px-4 pb-4 xl:hidden"
        >
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center py-3 ${linkClass(item.path)}`}
            >
              {item.label}
              {item.path === '/tasks' && <TasksBadge />}
            </Link>
          ))}
          <div className="border-tertiary mt-2 border-t pt-3">
            <span
              className="text-muted block truncate text-sm"
              title={accountName}
            >
              {accountName}
            </span>
            {accountItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`block py-3 ${linkClass(item.path)}`}
              >
                {item.label}
              </Link>
            ))}
            <hr className="border-tertiary my-2" />
            <button
              onClick={signOut}
              className="text-fg1 hover:bg-bg2 focus:ring-accent-bright w-full cursor-pointer rounded px-3 py-2 text-left focus:ring-2"
            >
              {t('Sign out')}
            </button>
          </div>
        </div>
      </nav>
      <main id="main-content">{children}</main>
    </div>
  );
}
