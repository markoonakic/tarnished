import { Outlet, NavLink, useLocation, Link, useNavigate } from 'react-router-dom';
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
    name: 'Personalization',
    sections: [
      { path: 'theme', label: 'Theme', icon: 'bi-palette' },
      { path: 'features', label: 'Features', icon: 'bi-toggle-on' },
    ],
  },
  {
    name: 'Account',
    sections: [
      { path: 'profile', label: 'Profile', icon: 'bi-person' },
      { path: 'api-key', label: 'API Key', icon: 'bi-key' },
    ],
  },
  {
    name: 'Workflow',
    sections: [
      { path: 'statuses', label: 'Application Statuses', icon: 'bi-signpost-2' },
      { path: 'round-types', label: 'Interview Round Types', icon: 'bi-list-check' },
    ],
  },
  {
    name: 'Data',
    sections: [
      { path: 'export', label: 'Data Export', icon: 'bi-download' },
      { path: 'import', label: 'Data Import', icon: 'bi-upload' },
    ],
  },
];

function DesktopSidebarLink({ section }: { section: SettingsSection }) {
  return (
    <NavLink
      to={section.path}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-2 rounded text-sm transition-all duration-200 ease-in-out cursor-pointer ${
          isActive
            ? 'bg-bg2 text-accent-bright'
            : 'text-fg1 hover:bg-bg2 hover:text-fg0'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <i className={`${section.icon} icon-sm transition-colors duration-200 ease-in-out ${isActive ? 'text-accent-bright' : 'text-muted group-hover:text-accent'}`} />
          {section.label}
        </>
      )}
    </NavLink>
  );
}

function MobileSectionCard({ section }: { section: SettingsSection }) {
  return (
    <NavLink
      to={section.path}
      className="group bg-bg1 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-bg2 active:bg-bg3 transition-all duration-200 ease-in-out"
    >
      <div className="flex items-center gap-3">
        <i className={`${section.icon} icon-md text-muted group-hover:text-accent transition-colors duration-200 ease-in-out`} />
        <span className="text-fg1 font-medium">{section.label}</span>
      </div>
      <i className="bi-chevron-right icon-sm text-muted group-hover:text-fg1 transition-colors duration-200 ease-in-out" />
    </NavLink>
  );
}

export function SettingsBackLink() {
  return (
    <Link
      to="/settings"
      className="text-accent hover:text-accent-bright text-sm flex items-center gap-2 transition-all duration-200 ease-in-out cursor-pointer mb-6"
    >
      <i className="bi-chevron-left icon-sm" />
      Back to Settings
    </Link>
  );
}

export default function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnSettingsRoot = location.pathname === '/settings';

  // On desktop, redirect /settings to /settings/theme
  useEffect(() => {
    if (isOnSettingsRoot && window.matchMedia('(min-width: 768px)').matches) {
      navigate('theme', { replace: true });
    }
  }, [isOnSettingsRoot, navigate]);

  return (
    <Layout>
      <div className="min-h-screen flex flex-col md:flex-row">
        {/* Desktop sidebar - hidden on mobile */}
        <aside className="hidden md:block w-72 bg-secondary py-8 px-3 flex-shrink-0">
          <h1 className="text-2xl font-bold text-fg1 mb-6 px-3">Settings</h1>
          <nav className="space-y-6">
            {settingsCategories.map((category) => (
              <div key={category.name}>
                <h2 className="text-xs font-bold text-muted uppercase px-3 mb-2 w-full truncate">
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

        {/* Desktop content area */}
        <main className="hidden md:block flex-1 min-w-0">
          <div className="max-w-4xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </main>

        {/* Mobile content - section list or nested route */}
        <div className="md:hidden flex-1">
          {isOnSettingsRoot ? (
            <div className="p-4">
              <h1 className="text-2xl font-bold text-fg1 mb-6">Settings</h1>
              <div className="space-y-6">
                {settingsCategories.map((category) => (
                  <div key={category.name}>
                    <h2 className="text-xs font-bold text-muted uppercase mb-2">
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
            <div className="p-4">
              <Outlet />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
