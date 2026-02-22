import { useState, useEffect } from 'react';
import {
  listRoundTypes,
  createRoundType,
  updateRoundType,
  deleteRoundType,
} from '../../lib/settings';
import type { RoundType } from '../../lib/types';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsRoundTypes() {
  const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
  const [newRoundTypeName, setNewRoundTypeName] = useState('');
  const [editingRoundType, setEditingRoundType] = useState<RoundType | null>(
    null
  );
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
        <h2 className="text-fg1 mb-4 text-xl font-bold">
          Interview Round Types
        </h2>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <Loading message="Loading settings..." />
        ) : (
          <>
            {roundTypes.filter((t) => !t.is_default).length === 0 && (
              <p className="text-muted bg-tertiary mb-4 rounded p-3 text-sm">
                Using default round types. Add custom round types to override.
              </p>
            )}
            <div className="mb-4 space-y-2">
              {roundTypes.map((type) => (
                <div
                  key={type.id}
                  className="bg-tertiary flex items-center justify-between rounded px-3 py-2"
                >
                  <span className="text-fg1">{type.name}</span>
                  <div className="flex items-center gap-2">
                    {type.is_default && (
                      <span className="text-muted text-xs">Default</span>
                    )}
                    {!type.is_default && (
                      <>
                        <button
                          onClick={() => startEditRoundType(type)}
                          className="text-fg1 hover:bg-bg3 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-xs transition-all duration-200 ease-in-out"
                        >
                          <i className="bi-pencil icon-xs"></i>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRoundType(type)}
                          className="text-red hover:bg-bg3 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-xs transition-all duration-200 ease-in-out"
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
              <form
                onSubmit={handleUpdateRoundType}
                className="bg-secondary mb-4 rounded p-3"
              >
                <div className="text-muted mb-2 text-sm">Edit Round Type</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editRoundTypeName}
                    onChange={(e) => setEditRoundTypeName(e.target.value)}
                    placeholder="Round type name"
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright flex-1 rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRoundType(null)}
                    className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded-md bg-transparent px-4 py-2 transition-all duration-200 ease-in-out"
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
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright flex-1 rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
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
