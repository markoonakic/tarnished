import { useState, useEffect } from 'react';
import { listStatuses, createStatus, updateStatus, deleteStatus, listRoundTypes, createRoundType } from '../lib/settings';
import { exportJSON, exportCSV } from '../lib/export';
import type { Status, RoundType } from '../lib/types';
import Layout from '../components/Layout';
import ThemeDropdown from '../components/ThemeDropdown';
import Loading from '../components/Loading';
import FeatureToggles from '../components/settings/FeatureToggles';

const THEMES = [
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    swatches: ['#282828', '#ebdbb2', '#8ec07c', '#b8bb26', '#fb4934'],
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    swatches: ['#fbf1c7', '#3c3836', '#689d6a', '#98971a', '#cc241d'],
  },
  {
    id: 'nord',
    name: 'Nord',
    swatches: ['#2e3440', '#eceff4', '#88c0d0', '#a3be8c', '#bf616a'],
  },
  {
    id: 'dracula',
    name: 'Dracula',
    swatches: ['#282a36', '#f8f8f2', '#8be9fd', '#50fa7b', '#ff5555'],
  },
];

function getStoredTheme(): string {
  return localStorage.getItem('theme') || 'gruvbox-dark';
}

function setTheme(themeId: string) {
  localStorage.setItem('theme', themeId);
  if (themeId === 'gruvbox-dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', themeId);
  }
}

export default function Settings() {
  const [currentTheme, setCurrentTheme] = useState(getStoredTheme());
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#8ec07c');
  const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  const [editStatusName, setEditStatusName] = useState('');
  const [editStatusColor, setEditStatusColor] = useState('');
  const [newRoundTypeName, setNewRoundTypeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState('theme');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statusData, roundTypeData] = await Promise.all([
        listStatuses(),
        listRoundTypes(),
      ]);
      setStatuses(statusData);
      setRoundTypes(roundTypeData);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  function handleThemeChange(themeId: string) {
    setTheme(themeId);
    setCurrentTheme(themeId);
  }

  async function handleAddStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatusName.trim()) return;

    try {
      await createStatus({ name: newStatusName.trim(), color: newStatusColor });
      setNewStatusName('');
      loadData();
    } catch {
      setError('Failed to create status');
    }
  }

  function startEditStatus(status: Status) {
    setEditingStatus(status);
    setEditStatusName(status.name);
    setEditStatusColor(status.color);
  }

  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStatus || !editStatusName.trim()) return;

    try {
      await updateStatus(editingStatus.id, {
        name: editStatusName.trim(),
        color: editStatusColor,
      });
      setEditingStatus(null);
      loadData();
    } catch {
      setError('Failed to update status');
    }
  }

  async function handleDeleteStatus(status: Status) {
    if (!confirm(`Delete status "${status.name}"? Applications using this status will need to be updated.`)) {
      return;
    }

    try {
      await deleteStatus(status.id);
      loadData();
    } catch {
      setError('Failed to delete status');
    }
  }

  async function handleAddRoundType(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoundTypeName.trim()) return;

    try {
      await createRoundType({ name: newRoundTypeName.trim() });
      setNewRoundTypeName('');
      loadData();
    } catch {
      setError('Failed to create round type');
    }
  }

  async function handleExportJSON() {
    setExporting(true);
    try {
      await exportJSON();
    } catch {
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCSV() {
    setExporting(true);
    try {
      await exportCSV();
    } catch {
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Layout>
      <div className="flex min-h-screen">
        {/* Sidebar - desktop */}
        <aside className="hidden md:block w-60 bg-secondary border-r border-tertiary">
          <div className="py-8">
            <h1 className="text-2xl font-bold text-primary mb-6 px-4">Settings</h1>
            <nav className="py-4">
              <a
                href="#theme"
                onClick={(e) => { e.preventDefault(); setActiveSection('theme'); }}
                className={`block px-4 py-3 text-sm transition-[border-color_200ms_ease] ${
                  activeSection === 'theme' ? 'text-aqua-bright' : 'text-aqua hover:text-aqua-bright'
                }`}
              >
                Theme
              </a>
              <a
                href="#features"
                onClick={(e) => { e.preventDefault(); setActiveSection('features'); }}
                className={`block px-4 py-3 text-sm transition-[border-color_200ms_ease] ${
                  activeSection === 'features' ? 'text-aqua-bright' : 'text-aqua hover:text-aqua-bright'
                }`}
              >
                Features
              </a>
              <a
                href="#statuses"
                onClick={(e) => { e.preventDefault(); setActiveSection('statuses'); }}
                className={`block px-4 py-3 text-sm transition-[border-color_200ms_ease] ${
                  activeSection === 'statuses' ? 'text-aqua-bright' : 'text-aqua hover:text-aqua-bright'
                }`}
              >
                Application Statuses
              </a>
              <a
                href="#rounds"
                onClick={(e) => { e.preventDefault(); setActiveSection('rounds'); }}
                className={`block px-4 py-3 text-sm transition-[border-color_200ms_ease] ${
                  activeSection === 'rounds' ? 'text-aqua-bright' : 'text-aqua hover:text-aqua-bright'
                }`}
              >
                Interview Round Types
              </a>
              <a
                href="#export"
                onClick={(e) => { e.preventDefault(); setActiveSection('export'); }}
                className={`block px-4 py-3 text-sm transition-[border-color_200ms_ease] ${
                  activeSection === 'export' ? 'text-aqua-bright' : 'text-aqua hover:text-aqua-bright'
                }`}
              >
                Data Export
              </a>
            </nav>
          </div>
        </aside>

        {/* Mobile dropdown */}
        <div className="md:hidden w-full p-4 border-b border-tertiary bg-secondary">
          <h1 className="text-2xl font-bold text-primary mb-4">Settings</h1>
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
          >
            <option value="theme">Theme</option>
            <option value="features">Features</option>
            <option value="statuses">Application Statuses</option>
            <option value="rounds">Interview Round Types</option>
            <option value="export">Data Export</option>
          </select>
        </div>

        {/* Content area */}
        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-8">
            {error && (
              <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded mb-6">
                {error}
              </div>
            )}

            <div className="space-y-8">
          {activeSection === 'theme' && (
            <div className="bg-secondary rounded-lg p-6">
              <h2 className="text-lg font-semibold text-primary mb-4">Theme</h2>
              <ThemeDropdown
                themes={THEMES}
                currentTheme={currentTheme}
                onChange={handleThemeChange}
              />
            </div>
          )}

          {activeSection === 'features' && (
            <FeatureToggles />
          )}

          {activeSection === 'statuses' && (
            <div className="bg-secondary rounded-lg p-6">
              <h2 className="text-lg font-semibold text-primary mb-4">Application Statuses</h2>

            {loading ? (
              <Loading message="Loading settings..." />
            ) : (
              <>
                {statuses.filter(s => !s.is_default).length === 0 && (
                  <p className="text-sm text-muted mb-4 p-3 bg-tertiary rounded">
                    Using default statuses. Add custom statuses to override.
                  </p>
                )}
                <div className="space-y-2 mb-4">
                  {statuses.map((status) => (
                    <div
                      key={status.id}
                      className="flex items-center justify-between bg-tertiary rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: status.color }}
                        />
                        <span className="text-primary">{status.name}</span>
                        {status.is_default && (
                          <span className="text-xs text-muted">(Default)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditStatus(status)}
                          className="px-3 py-1.5 bg-secondary text-fg1 text-xs rounded hover:bg-tertiary hover:text-fg0 transition-[border-color_200ms_ease] flex items-center gap-1.5 cursor-pointer"
                        >
                          <i className="bi-pencil text-xs"></i>
                          Edit
                        </button>
                        {!status.is_default && (
                          <button
                            onClick={() => handleDeleteStatus(status)}
                            className="px-3 py-1.5 bg-secondary text-red text-xs rounded hover:bg-tertiary hover:text-red-bright transition-[border-color_200ms_ease] flex items-center gap-1.5 cursor-pointer"
                          >
                            <i className="bi-trash text-xs"></i>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {editingStatus ? (
                  <form onSubmit={handleUpdateStatus} className="mb-4 p-3 bg-secondary border border-muted rounded">
                    <div className="text-sm text-muted mb-2">Edit Status</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editStatusName}
                        onChange={(e) => setEditStatusName(e.target.value)}
                        placeholder="Status name"
                        className="flex-1 px-3 py-2 bg-tertiary border border-transparent rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua transition-[border-color_200ms_ease]"
                      />
                      <input
                        type="color"
                        value={editStatusColor}
                        onChange={(e) => setEditStatusColor(e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer bg-bg1 border border-muted"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright transition-all duration-200 cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingStatus(null)}
                        className="px-4 py-2 bg-bg1 text-fg1 rounded hover:bg-bg2 hover:text-fg0 transition-all duration-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleAddStatus} className="flex gap-2">
                    <input
                      type="text"
                      value={newStatusName}
                      onChange={(e) => setNewStatusName(e.target.value)}
                      placeholder="New status name"
                      className="flex-1 px-3 py-2 bg-tertiary border border-transparent rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua transition-[border-color_200ms_ease]"
                    />
                    <input
                      type="color"
                      value={newStatusColor}
                      onChange={(e) => setNewStatusColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer bg-bg1 border border-transparent"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright transition-all duration-200 cursor-pointer"
                    >
                      Add
                    </button>
                  </form>
                )}

                <p className="text-xs text-muted mt-3">
                  Editing default statuses creates your personal override.
                </p>
              </>
            )}
            </div>
          )}

          {activeSection === 'rounds' && (
            <div className="bg-secondary rounded-lg p-6">
              <h2 className="text-lg font-semibold text-primary mb-4">Interview Round Types</h2>

            {loading ? (
              <Loading message="Loading settings..." />
            ) : (
              <>
                {roundTypes.filter(t => !t.is_default).length === 0 && (
                  <p className="text-sm text-muted mb-4 p-3 bg-tertiary rounded">
                    Using default round types. Add custom round types to override.
                  </p>
                )}
                <div className="space-y-2 mb-4">
                  {roundTypes.map((type) => (
                    <div
                      key={type.id}
                      className="flex items-center justify-between bg-tertiary rounded px-3 py-2"
                    >
                      <span className="text-primary">{type.name}</span>
                      {type.is_default && (
                        <span className="text-xs text-muted">Default</span>
                      )}
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddRoundType} className="flex gap-2">
                  <input
                    type="text"
                    value={newRoundTypeName}
                    onChange={(e) => setNewRoundTypeName(e.target.value)}
                    placeholder="New round type name"
                    className="flex-1 px-3 py-2 bg-tertiary border border-transparent rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua transition-[border-color_200ms_ease]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright transition-all duration-200 cursor-pointer"
                  >
                    Add
                  </button>
                </form>
              </>
            )}
            </div>
          )}

          {activeSection === 'export' && (
            <div className="bg-secondary rounded-lg p-6">
              <h2 className="text-lg font-semibold text-primary mb-4">Export Data</h2>
            <p className="text-sm text-muted mb-4">
              Download all your application data for backup or analysis.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleExportJSON}
                disabled={exporting}
                className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright disabled:opacity-50 transition-all duration-200 cursor-pointer"
              >
                {exporting ? 'Exporting...' : 'Export JSON'}
              </button>
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright disabled:opacity-50 transition-all duration-200 cursor-pointer"
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            </div>
          )}
          </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}
