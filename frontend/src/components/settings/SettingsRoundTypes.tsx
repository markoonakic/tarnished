import { useState, useEffect } from 'react';
import { listRoundTypes, createRoundType, updateRoundType, deleteRoundType } from '../../lib/settings';
import type { RoundType } from '../../lib/types';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsRoundTypes() {
  const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
  const [newRoundTypeName, setNewRoundTypeName] = useState('');
  const [editingRoundType, setEditingRoundType] = useState<RoundType | null>(null);
  const [editRoundTypeName, setEditRoundTypeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const roundTypeData = await listRoundTypes();
      setRoundTypes(roundTypeData);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  function startEditRoundType(roundType: RoundType) {
    setEditingRoundType(roundType);
    setEditRoundTypeName(roundType.name);
  }

  async function handleUpdateRoundType(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRoundType || !editRoundTypeName.trim()) return;

    try {
      await updateRoundType(editingRoundType.id, {
        name: editRoundTypeName.trim(),
      });
      setEditingRoundType(null);
      loadData();
    } catch {
      setError('Failed to update round type');
    }
  }

  async function handleDeleteRoundType(roundType: RoundType) {
    if (!confirm(`Delete round type "${roundType.name}"?`)) {
      return;
    }

    try {
      await deleteRoundType(roundType.id);
      loadData();
    } catch {
      setError('Failed to delete round type');
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

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">Interview Round Types</h2>

        {error && (
          <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

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
                  <span className="text-fg1">{type.name}</span>
                  <div className="flex items-center gap-2">
                    {type.is_default && (
                      <span className="text-xs text-muted">Default</span>
                    )}
                    {!type.is_default && (
                      <>
                        <button
                          onClick={() => startEditRoundType(type)}
                          className="px-3 py-1.5 bg-transparent text-fg1 text-xs rounded hover:bg-bg3 hover:text-fg0 transition-all duration-200 ease-in-out flex items-center gap-1.5 cursor-pointer"
                        >
                          <i className="bi-pencil icon-xs"></i>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRoundType(type)}
                          className="px-3 py-1.5 bg-transparent text-red text-xs rounded hover:bg-bg3 hover:text-red-bright transition-all duration-200 ease-in-out flex items-center gap-1.5 cursor-pointer"
                        >
                          <i className="bi-trash icon-xs"></i>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editingRoundType ? (
              <form onSubmit={handleUpdateRoundType} className="mb-4 p-3 bg-secondary rounded">
                <div className="text-sm text-muted mb-2">Edit Round Type</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editRoundTypeName}
                    onChange={(e) => setEditRoundTypeName(e.target.value)}
                    placeholder="Round type name"
                    className="flex-1 px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                  />
                  <button
                    type="submit"
                    className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRoundType(null)}
                    className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddRoundType} className="flex gap-2">
                <input
                  type="text"
                  value={newRoundTypeName}
                  onChange={(e) => setNewRoundTypeName(e.target.value)}
                  placeholder="New round type name"
                  className="flex-1 px-3 py-2 bg-bg2 rounded text-fg1 placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent-bright transition-all duration-200 ease-in-out"
                />
                <button
                  type="submit"
                  className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
                >
                  Add
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
