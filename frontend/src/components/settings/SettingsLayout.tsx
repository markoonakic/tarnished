import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import {
  Outlet,
  NavLink,
  useLocation,
  Link,
  useNavigate,
} from 'react-router-dom';
import { useEffect } from 'react';
import Layout from '../Layout';

interface SettingsSection {
  path: string;
  label: string;
  icon: string;
}

interface SettingsCategory {
  name: string;
  sections: SettingsSection[];
}

const settingsCategories: SettingsCategory[] = [
  {
    get name() {
      return t('Personalization');
    },
    sections: [
      {
        path: 'theme',
        get label() {
          return t('Theme');
        },
        icon: 'bi-palette',
      },
      {
        path: 'features',
        get label() {
          return t('Features');
        },
        icon: 'bi-toggle-on',
      },
      {
        path: 'language',
        get label() {
          return t('Language & time');
        },
        icon: 'bi-translate',
      },
    ],
  },
  {
    get name() {
      return t('Account');
    },
    sections: [
      {
        path: 'security',
        get label() {
          return t('Security');
        },
        icon: 'bi-shield-lock',
      },
      {
        path: 'api-key',
        get label() {
          return t('API Keys');
        },
        icon: 'bi-key',
      },
    ],
  },
  {
    get name() {
      return t('Workflow');
    },
    sections: [
      {
        path: 'statuses',
        get label() {
          return t('Application Statuses');
        },
        icon: 'bi-signpost-2',
      },
      {
        path: 'round-types',
        get label() {
          return t('Interview Round Types');
        },
        icon: 'bi-list-check',
      },
    ],
  },
  {
    get name() {
      return t('Data');
    },
    sections: [
      {
        path: 'export',
        get label() {
          return t('Data Export');
        },
        icon: 'bi-download',
      },
      {
        path: 'import',
        get label() {
          return t('Data Import');
        },
        icon: 'bi-upload',
      },
    ],
  },
];

function DesktopSidebarLink({ section }: { section: SettingsSection }) {
  useTranslation();
  return (
    <NavLink
      to={section.path}
      className={({ isActive }) =>
        `group flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm transition-all duration-200 ease-in-out ${
          isActive
            ? 'bg-bg2 text-accent-bright'
            : 'text-fg1 hover:bg-bg2 hover:text-fg0'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <i
            className={`${section.icon} icon-sm transition-colors duration-200 ease-in-out ${isActive ? 'text-accent-bright' : 'text-muted group-hover:text-accent'}`}
          />
          {section.label}
        </>
      )}
    </NavLink>
  );
}

function MobileSectionCard({ section }: { section: SettingsSection }) {
  useTranslation();
  return (
    <NavLink
      to={section.path}
      className="bg-bg1 hover:bg-bg2 active:bg-bg3 group flex cursor-pointer items-center justify-between rounded-lg p-4 transition-all duration-200 ease-in-out"
    >
      <div className="flex items-center gap-3">
        <i
          className={`${section.icon} icon-md text-muted group-hover:text-accent transition-colors duration-200 ease-in-out`}
        />
        <span className="text-fg1 font-medium">{section.label}</span>
      </div>
      <i className="bi-chevron-right icon-sm text-muted group-hover:text-fg1 transition-colors duration-200 ease-in-out" />
    </NavLink>
  );
}

export function SettingsBackLink() {
  useTranslation();
  return (
    <Link
      to="/settings"
      className="text-accent hover:text-accent-bright mb-6 flex cursor-pointer items-center gap-2 text-sm transition-all duration-200 ease-in-out"
    >
      <i className="bi-chevron-left icon-sm" />
      {t('Back to Settings')}
    </Link>
  );
}

export default function SettingsLayout() {
  useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isOnSettingsRoot = location.pathname === '/settings';

  useEffect(() => {
    if (!isOnSettingsRoot) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const showDesktopSettings = () => {
      if (desktop.matches) navigate('theme', { replace: true });
    };
    showDesktopSettings();
    desktop.addEventListener('change', showDesktopSettings);
    return () => desktop.removeEventListener('change', showDesktopSettings);
  }, [isOnSettingsRoot, navigate]);

  return (
    <Layout>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="bg-secondary hidden w-72 flex-shrink-0 px-3 py-8 md:block">
          <h1 className="text-fg1 mb-6 px-3 text-2xl font-bold">
            {t('Settings')}
          </h1>
          <nav className="space-y-6">
            {settingsCategories.map((category) => (
              <div key={category.name}>
                <h2 className="text-muted mb-2 w-full truncate px-3 text-xs font-bold uppercase">
                  {category.name}
                </h2>
                <ul className="space-y-1">
                  {category.sections.map((section) => (
                    <li key={section.path}>
                      <DesktopSidebarLink section={section} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {isOnSettingsRoot ? (
            <div className="p-4 md:hidden">
              <h1 className="text-fg1 mb-6 text-2xl font-bold">
                {t('Settings')}
              </h1>
              <div className="space-y-6">
                {settingsCategories.map((category) => (
                  <div key={category.name}>
                    <h2 className="text-muted mb-2 text-xs font-bold uppercase">
                      {category.name}
                    </h2>
                    <ul className="space-y-2">
                      {category.sections.map((section) => (
                        <li key={section.path}>
                          <MobileSectionCard section={section} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl p-4 md:px-6 md:py-8">
              <Outlet />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
