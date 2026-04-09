import { useCallback, useEffect, useState } from 'react';

import {
  createAPIKey,
  deleteAPIKey,
  listAPIKeys,
  updateAPIKey,
} from '../../lib/settings';
import type { APIKey } from '../../lib/types';
import { useToast } from '@/hooks/useToast';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

const API_KEY_PRESETS = [
  { value: 'full_access', label: 'Full Access' },
  { value: 'cli', label: 'CLI' },
  { value: 'extension', label: 'Extension' },
  { value: 'read_only', label: 'Read Only' },
  { value: 'import_export', label: 'Import / Export' },
  { value: 'custom', label: 'Custom' },
] as const;

const PRESET_SCOPES: Record<string, string[]> = {
  full_access: [
    'applications:read',
    'applications:write',
    'job_leads:read',
    'job_leads:write',
    'profile:read',
    'profile:write',
    'rounds:read',
    'rounds:write',
    'statuses:read',
    'statuses:write',
    'round_types:read',
    'round_types:write',
    'dashboard:read',
    'analytics:read',
    'preferences:read',
    'preferences:write',
    'user_settings:read',
    'user_settings:write',
    'files:read',
    'files:write',
    'export:read',
    'import:write',
  ],
  cli: [
    'applications:read',
    'applications:write',
    'job_leads:read',
    'job_leads:write',
    'profile:read',
    'profile:write',
    'rounds:read',
    'rounds:write',
    'statuses:read',
    'statuses:write',
    'round_types:read',
    'round_types:write',
    'dashboard:read',
    'analytics:read',
    'preferences:read',
    'preferences:write',
    'user_settings:read',
    'user_settings:write',
    'files:read',
    'files:write',
    'export:read',
    'import:write',
  ],
  extension: [
    'applications:read',
    'applications:write',
    'job_leads:read',
    'job_leads:write',
    'profile:read',
    'statuses:read',
    'user_settings:read',
  ],
  read_only: [
    'applications:read',
    'job_leads:read',
    'profile:read',
    'rounds:read',
    'statuses:read',
    'round_types:read',
    'dashboard:read',
    'analytics:read',
    'preferences:read',
    'user_settings:read',
    'files:read',
    'export:read',
  ],
  import_export: [
    'applications:read',
    'job_leads:read',
    'export:read',
    'import:write',
  ],
};

const ALL_SCOPES = Array.from(
  new Set(Object.values(PRESET_SCOPES).flat())
).sort();

function formatDate(value: string | null): string {
  if (!value) {
    return 'Never';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString();
}

function formatMaskedKey(prefix: string): string {
  return `${prefix}...`;
}

export default function SettingsAPIKey() {
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPreset, setNewPreset] = useState<string>('full_access');
  const [newScopes, setNewScopes] = useState<string[]>(
    PRESET_SCOPES.full_access
  );
  const [advancedScopesOpen, setAdvancedScopesOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const loadAPIKeys = useCallback(async () => {
    try {
      const data = await listAPIKeys();
      setApiKeys(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAPIKeys();
  }, [loadAPIKeys]);

  async function handleCreateKey() {
    const label = newLabel.trim();
    if (!label) {
      toast.error('Enter a label for the API key');
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        newPreset === 'custom'
          ? { label, preset: 'custom', scopes: newScopes }
          : { label, preset: newPreset };
      const created = await createAPIKey(payload);
      setApiKeys((current) => [created, ...current]);
      setRevealedKey(created.api_key);
      setNewLabel('');
      setNewPreset('full_access');
      setNewScopes(PRESET_SCOPES.full_access);
      setAdvancedScopesOpen(false);
      toast.success('API key created');
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setSubmitting(false);
    }
  }

  function handlePresetChange(value: string) {
    setNewPreset(value);
    setNewScopes(PRESET_SCOPES[value] ?? []);
  }

  function handleScopeToggle(scope: string) {
    setNewPreset('custom');
    setNewScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope].sort()
    );
  }

  async function handleCopyRevealedKey() {
    if (!revealedKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(revealedKey);
      toast.success('API key copied to clipboard');
    } catch {
      toast.error('Failed to copy API key');
    }
  }

  async function handleRenameKey(id: string) {
    const label = editingLabel.trim();
    if (!label) {
      toast.error('Enter a label for the API key');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateAPIKey(id, { label });
      setApiKeys((current) =>
        current.map((item) => (item.id === id ? updated : item))
      );
      setEditingId(null);
      setEditingLabel('');
      toast.success('API key updated');
    } catch {
      toast.error('Failed to update API key');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm('Revoke this API key? It will stop working immediately.')) {
      return;
    }

    setSubmitting(true);
    try {
      await deleteAPIKey(id);
      setApiKeys((current) => current.filter((item) => item.id !== id));
      toast.success('API key revoked');
    } catch {
      toast.error('Failed to revoke API key');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">API Keys</h2>
        <p className="text-muted mb-6 text-sm">
          Create a separate API key for each CLI profile or browser extension.
          Keys are shown in full only once when created.
        </p>

        {loading ? (
          <Loading message="Loading API keys..." />
        ) : (
          <div className="space-y-6">
            <div className="bg-tertiary rounded-lg p-4">
              <h3 className="text-fg1 mb-3 text-sm font-medium">
                Create API Key
              </h3>
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="MacBook CLI"
                  className="bg-bg2 text-fg1 border-bg3 focus:border-accent flex-1 rounded border px-3 py-2 text-sm transition-all duration-200 ease-in-out outline-none"
                />
                <div className="flex flex-col gap-1">
                  <label className="text-muted text-xs">Preset</label>
                  <select
                    value={newPreset}
                    onChange={(event) => handlePresetChange(event.target.value)}
                    className="bg-bg2 text-fg1 border-bg3 focus:border-accent rounded border px-3 py-2 text-sm transition-all duration-200 ease-in-out outline-none"
                  >
                    {API_KEY_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedScopesOpen((current) => !current)}
                  className="bg-bg3 hover:bg-bg4 text-fg1 flex cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm transition-all duration-200 ease-in-out"
                >
                  <i className="bi-sliders icon-sm" />
                  Advanced Scopes
                </button>
                <button
                  onClick={handleCreateKey}
                  disabled={submitting}
                  className="bg-accent text-bg0 hover:bg-accent-bright flex cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <i className="bi-key icon-sm" />
                  Create API Key
                </button>
              </div>
              {advancedScopesOpen && (
                <div className="border-bg3 mt-4 rounded border p-3">
                  <p className="text-muted mb-3 text-xs">
                    Editing scopes directly will turn this key into a custom
                    key.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {ALL_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className="text-fg1 flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={newScopes.includes(scope)}
                          onChange={() => handleScopeToggle(scope)}
                        />
                        {scope}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {revealedKey && (
              <div className="bg-tertiary rounded-lg p-4">
                <h3 className="text-fg1 mb-2 text-sm font-medium">
                  New API Key
                </h3>
                <p className="text-muted mb-3 text-xs">
                  Copy this now. You will not be able to view it again.
                </p>
                <div className="flex items-center gap-2">
                  <div className="text-fg1 bg-bg2 flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-sm break-all">
                    {revealedKey}
                  </div>
                  <button
                    onClick={handleCopyRevealedKey}
                    className="bg-bg3 hover:bg-bg4 text-fg1 flex cursor-pointer items-center gap-2 rounded px-3 py-2 transition-all duration-200 ease-in-out"
                  >
                    <i className="bi-clipboard icon-sm" />
                    Copy
                  </button>
                </div>
              </div>
            )}

            {apiKeys.length === 0 ? (
              <div className="bg-tertiary rounded-lg p-4">
                <p className="text-muted text-sm">
                  You do not have any API keys yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="bg-tertiary rounded-lg p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        {editingId === apiKey.id ? (
                          <div className="flex flex-col gap-2 md:flex-row">
                            <input
                              value={editingLabel}
                              onChange={(event) =>
                                setEditingLabel(event.target.value)
                              }
                              className="bg-bg2 text-fg1 border-bg3 focus:border-accent rounded border px-3 py-2 text-sm transition-all duration-200 ease-in-out outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRenameKey(apiKey.id)}
                                disabled={submitting}
                                className="bg-bg3 hover:bg-bg4 text-fg1 cursor-pointer rounded px-3 py-2 text-sm transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setEditingLabel('');
                                }}
                                className="text-muted hover:text-fg1 cursor-pointer rounded px-3 py-2 text-sm transition-all duration-200 ease-in-out"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-fg1 font-medium">{apiKey.label}</p>
                        )}
                        <p className="text-fg2 font-mono text-sm">
                          {formatMaskedKey(apiKey.key_prefix)}
                        </p>
                        <p className="text-muted text-xs">
                          Preset: {apiKey.preset}
                        </p>
                        {apiKey.preset === 'custom' && (
                          <p className="text-muted text-xs">
                            Scopes: {apiKey.scopes.join(', ')}
                          </p>
                        )}
                        <p className="text-muted text-xs">
                          Created: {formatDate(apiKey.created_at)}
                        </p>
                        <p className="text-muted text-xs">
                          Last used: {formatDate(apiKey.last_used_at)}
                        </p>
                      </div>

                      {editingId !== apiKey.id && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingId(apiKey.id);
                              setEditingLabel(apiKey.label);
                            }}
                            className="bg-bg3 hover:bg-bg4 text-fg1 cursor-pointer rounded px-3 py-2 text-sm transition-all duration-200 ease-in-out"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => handleDeleteKey(apiKey.id)}
                            disabled={submitting}
                            className="text-red hover:bg-bg3 hover:text-red-bright cursor-pointer rounded px-3 py-2 text-sm transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
