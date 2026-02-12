import { useState, useEffect } from 'react';
import { listStatuses, createStatus, updateStatus, deleteStatus } from '../../lib/settings';
import type { Status } from '../../lib/types';
import { getDefaultNewStatusColor } from '../../lib/statusColors';
import { useThemeColors } from '../../hooks/useThemeColors';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsStatuses() {
  const colors = useThemeColors();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState(() => getDefaultNewStatusColor(colors));
  const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  const [editStatusName, setEditStatusName] = useState('');
  const [editStatusColor, setEditStatusColor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // Update default new status color when theme changes (only if user hasn't started entering a name)
  useEffect(() => {
    if (!newStatusName) {
      setNewStatusColor(getDefaultNewStatusColor(colors));
    }
  }, [colors.aquaBright]);

  async function loadData() {
    try {
      const statusData = await listStatuses();
      setStatuses(statusData);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
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

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">Application Statuses</h2>

        {error && (
          <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

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
                    <span className="text-fg1">{status.name}</span>
                    {status.is_default && (
                      <span className="text-xs text-muted">(Default)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!status.is_default && (
                      <button
                        onClick={() => startEditStatus(status)}
                        className="px-3 py-1.5 bg-transparent text-fg1 text-xs rounded hover:bg-bg3 hover:text-fg0 transition-all duration-200 ease-in-out flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="bi-pencil icon-xs"></i>
                        Edit
                      </button>
                    )}
                    {!status.is_default && (
                      <button
                        onClick={() => handleDeleteStatus(status)}
                        className="px-3 py-1.5 bg-transparent text-red text-xs rounded hover:bg-bg3 hover:text-red-bright transition-all duration-200 ease-in-out flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="bi-trash icon-xs"></i>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editingStatus ? (
              <form onSubmit={handleUpdateStatus} className="mb-4 p-3 bg-secondary rounded">
                <div className="text-sm text-muted mb-2">Edit Status</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editStatusName}
                    onChange={(e) => setEditStatusName(e.target.value)}
                    placeholder="Status name"
                    className="flex-1 px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                  />
                  <input
                    type="color"
                    value={editStatusColor}
                    onChange={(e) => setEditStatusColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer bg-bg2 border border-tertiary"
                  />
                  <button
                    type="submit"
                    className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingStatus(null)}
                    className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md cursor-pointer"
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
                  className="flex-1 px-3 py-2 bg-bg2 rounded text-fg1 placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent-bright transition-all duration-200 ease-in-out"
                />
                <input
                  type="color"
                  value={newStatusColor}
                  onChange={(e) => setNewStatusColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer bg-bg2 border border-tertiary"
                />
                <button
                  type="submit"
                  className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
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
    </>
  );
}
