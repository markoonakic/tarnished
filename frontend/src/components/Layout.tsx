import TextLink from '@/components/ui/TextLink';
import Button from '@/components/ui/Button';
import PopoverLayer from '@/components/ui/PopoverLayer';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from '@/lib/i18n';
import TasksBadge from './TasksBadge';
import { useReminderNotifications } from '@/hooks/useReminderNotifications';
import SignupRequestDot from './accounts/SignupRequestDot';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  useTranslation();
  const { user, signOut } = useAuth();
  useReminderNotifications(user?.id);
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
      ? 'underline underline-offset-4'
      : '';
  }
  return (
    <div className="bg-primary min-h-screen">
      <nav className="bg-secondary border-tertiary border-b" ref={menuRef}>
        <TextLink
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
        >
          {t('Skip to main content')}
        </TextLink>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <TextLink to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 bg-current [mask-image:url('/tree.svg')] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]" />
              Tarnished
            </TextLink>
            <div className="hidden items-center gap-6 whitespace-nowrap xl:flex">
              {navigation.map((item) => (
                <TextLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center ${linkClass(item.path)} `}
                >
                  {item.label}
                  {item.path === '/tasks' && <TasksBadge />}
                </TextLink>
              ))}
            </div>
          </div>
          <div className="relative hidden min-w-0 xl:block">
            <Button
              ref={accountButton}
              onClick={() => setAccountOpen(!accountOpen)}
              aria-expanded={accountOpen}
              aria-controls="account-links"
              className="flex max-w-64 items-center gap-1.5"
            >
              <span className="truncate" title={accountName}>
                {accountName}
              </span>
              {user?.is_admin && <SignupRequestDot />}
              <i className="bi-chevron-down icon-sm" aria-hidden="true" />
            </Button>
            {accountOpen && (
              <PopoverLayer
                id="account-links"
                aria-label={t('Account menu')}
                className="p-2"
              >
                {accountItems.map((item) => (
                  <TextLink
                    key={item.path}
                    to={item.path}
                    className="flex items-center gap-2"
                  >
                    <i className={item.icon} aria-hidden="true" />
                    {item.label}
                    {item.path === '/admin' && <SignupRequestDot />}
                  </TextLink>
                ))}
                <hr className="border-tertiary my-2" />
                <Button
                  onClick={signOut}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  <i className="bi-box-arrow-right" aria-hidden="true" />
                  {t('Sign out')}
                </Button>
              </PopoverLayer>
            )}
          </div>
          <Button
            variant="icon"
            ref={mobileButton}
            onClick={() => setMenuOpen(!menuOpen)}
            className="xl:hidden"
            aria-label={t('Toggle menu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            title={t('Toggle menu')}
          >
            <i
              className={`bi-${menuOpen ? 'x-lg' : 'list'} icon-lg`}
              aria-hidden="true"
            />
          </Button>
        </div>
        <div
          inert={!menuOpen}
          aria-hidden={!menuOpen}
          hidden={!menuOpen}
          id="mobile-navigation"
          className="border-tertiary border-t px-4 pb-4 xl:hidden"
        >
          {navigation.map((item) => (
            <TextLink
              key={item.path}
              to={item.path}
              className={`flex items-center ${linkClass(item.path)} `}
            >
              {item.label}
              {item.path === '/tasks' && <TasksBadge />}
            </TextLink>
          ))}
          <div className="border-tertiary mt-2 border-t pt-3">
            <span
              className="text-muted block truncate text-sm"
              title={accountName}
            >
              {accountName}
            </span>
            {accountItems.map((item) => (
              <TextLink
                key={item.path}
                to={item.path}
                className={`block ${linkClass(item.path)} `}
              >
                {item.label}
                {item.path === '/admin' && <SignupRequestDot />}
              </TextLink>
            ))}
            <hr className="border-tertiary my-2" />
            <Button
              onClick={signOut}
              className="flex w-full items-center gap-1.5 text-left"
            >
              <i className="bi-arrow-right icon-sm" aria-hidden="true" />
              {t('Sign out')}
            </Button>
          </div>
        </div>
      </nav>
      <main id="main-content">{children}</main>
    </div>
  );
}
