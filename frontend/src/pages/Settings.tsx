import { useState, useEffect } from 'react';
import { listStatuses, createStatus, listRoundTypes, createRoundType } from '../lib/settings';
import { exportJSON, exportCSV } from '../lib/export';
import type { Status, RoundType } from '../lib/types';
import Layout from '../components/Layout';

const THEMES = [
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', description: 'Warm, retro groove colors' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', description: 'Light variant of Gruvbox' },
  { id: 'nord', name: 'Nord', description: 'Arctic, bluish clean design' },
  { id: 'dracula', name: 'Dracula', description: 'Dark theme with vibrant colors' },
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
  const [newRoundTypeName, setNewRoundTypeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Settings</h1>

        {error && (
          <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="space-y-8">
          <div className="bg-secondary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Theme</h2>
            <div className="grid grid-cols-2 gap-4">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    currentTheme === theme.id
                      ? 'border-accent-aqua bg-tertiary'
                      : 'border-tertiary hover:border-muted'
                  }`}
                >
                  <span className="text-primary font-medium">{theme.name}</span>
                  <p className="text-sm text-muted mt-1">{theme.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-secondary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Application Statuses</h2>

            {loading ? (
              <div className="text-muted">Loading...</div>
            ) : (
              <>
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
                      </div>
                      {status.is_default && (
                        <span className="text-xs text-muted">Default</span>
                      )}
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddStatus} className="flex gap-2">
                  <input
                    type="text"
                    value={newStatusName}
                    onChange={(e) => setNewStatusName(e.target.value)}
                    placeholder="New status name"
                    className="flex-1 px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua"
                  />
                  <input
                    type="color"
                    value={newStatusColor}
                    onChange={(e) => setNewStatusColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer bg-tertiary border border-muted"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-accent-aqua text-bg-primary rounded hover:opacity-90"
                  >
                    Add
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="bg-secondary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Interview Round Types</h2>

            {loading ? (
              <div className="text-muted">Loading...</div>
            ) : (
              <>
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
                    className="flex-1 px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-accent-aqua text-bg-primary rounded hover:opacity-90"
                  >
                    Add
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="bg-secondary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Export Data</h2>
            <p className="text-sm text-muted mb-4">
              Download all your application data for backup or analysis.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleExportJSON}
                disabled={exporting}
                className="px-4 py-2 bg-accent-aqua text-bg-primary rounded hover:opacity-90 disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Export JSON'}
              </button>
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
