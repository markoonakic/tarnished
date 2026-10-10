import Button from '@/components/ui/Button';
import HelpTip from '../HelpTip';
import { formatDateTime } from '@/lib/displayDate';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { observeRead } from '@/lib/queryClient';
import { useCallback, useEffect, useState } from 'react';

import {
  createAPIKey,
  deleteAPIKey,
  listAPIKeys,
  updateAPIKey,
} from '../../lib/settings';
import type { APIKey } from '../../lib/types';
import { useToast } from '@/hooks/useToast';
import Dropdown from '../Dropdown';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

const API_KEY_PRESETS = [
  {
    value: 'full_access',
    get label() {
      return t('Full Access');
    },
  },
  {
    value: 'cli',
    get label() {
      return t('CLI');
    },
  },
  {
    value: 'extension',
    get label() {
      return t('Extension');
    },
  },
  {
    value: 'read_only',
    get label() {
      return t('Read Only');
    },
  },
  {
    value: 'import_export',
    get label() {
      return t('Import / Export');
    },
  },
  {
    value: 'custom',
    get label() {
      return t('Custom');
    },
  },
] as const;

const FULL_ACCESS_SCOPES = [
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
];

const PRESET_SCOPES: Record<string, string[]> = {
  full_access: FULL_ACCESS_SCOPES,
  cli: FULL_ACCESS_SCOPES,
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
    return t('Never');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t('Unknown');
  }

  return formatDateTime(date);
}

function formatMaskedKey(prefix: string): string {
  return `${prefix}...`;
}

export default function SettingsAPIKey() {
  useTranslation();
  const toast = useToast();
  const { error: showError } = toast;
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
  const [editingPreset, setEditingPreset] = useState<string>('full_access');
  const [editingScopes, setEditingScopes] = useState<string[]>([]);
  const [editingAdvancedScopesOpen, setEditingAdvancedScopesOpen] =
    useState(false);

  const loadAPIKeys = useCallback(async () => {
    try {
      const data = await listAPIKeys();
      setApiKeys(Array.isArray(data) ? data : []);
    } catch (error) {
      showError(t('Failed to load API keys'));
      return { error };
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => observeRead(loadAPIKeys), [loadAPIKeys]);

  async function handleCreateKey() {
    const label = newLabel.trim();
    if (!label) {
      showError(t('Enter a label for the API key'));
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
      toast.success(t('API key created'));
    } catch {
      showError(t('Failed to create API key'));
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

  function handleEditingScopeToggle(scope: string) {
    setEditingPreset('custom');
    setEditingScopes((current) =>
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
      toast.success(t('API key copied to clipboard'));
    } catch {
      showError(t('Failed to copy API key'));
    }
  }

  async function handleRenameKey(id: string) {
    const label = editingLabel.trim();
    if (!label) {
      showError(t('Enter a label for the API key'));
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        editingPreset === 'custom'
          ? { label, preset: 'custom', scopes: editingScopes }
          : { label, preset: editingPreset };
      const updated = await updateAPIKey(id, payload);
      setApiKeys((current) =>
        current.map((item) => (item.id === id ? updated : item))
      );
      setEditingId(null);
      setEditingLabel('');
      setEditingPreset('full_access');
      setEditingScopes([]);
      setEditingAdvancedScopesOpen(false);
      toast.success(t('API key updated'));
    } catch {
      showError(t('Failed to update API key'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm(t('Revoke this API key? It will stop working immediately.'))) {
      return;
    }

    setSubmitting(true);
    try {
      await deleteAPIKey(id);
      setApiKeys((current) => current.filter((item) => item.id !== id));
      toast.success(t('API key revoked'));
    } catch {
      showError(t('Failed to revoke API key'));
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
        <h2 className="text-fg1 mb-4 text-xl font-bold">
          {t('API Keys')}
          <HelpTip label={t('About API keys')}>
            {t(
              'Create a separate API key for each CLI profile or browser extension. Keys are shown in full only once when created.'
            )}
          </HelpTip>
        </h2>

        {loading ? (
          <Loading message={t('Loading API keys...')} />
        ) : (
          <div className="space-y-6">
            <div className="bg-bg2 rounded-lg p-4">
              <h3 className="text-fg1 mb-4 text-base font-medium">
                {t('Create API Key')}
              </h3>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-api-key-label"
                    className="text-muted mb-1.5 block text-sm"
                  >
                    {t('Label')}
                  </label>
                  <input
                    id="new-api-key-label"
                    value={newLabel}
                    onChange={(event) => setNewLabel(event.target.value)}
                    placeholder={t('MacBook CLI')}
                    className="bg-bg3 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-api-key-preset"
                    className="text-muted mb-1.5 block text-sm"
                  >
                    {t('Preset')}
                  </label>
                  <Dropdown
                    id="new-api-key-preset"
                    options={API_KEY_PRESETS.map((preset) => ({
                      value: preset.value,
                      label: preset.label,
                    }))}
                    value={newPreset}
                    onChange={handlePresetChange}
                    placeholder={t('Select preset')}
                    containerBackground="bg2"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => setAdvancedScopesOpen((current) => !current)}
                  className="flex items-center justify-center gap-2"
                >
                  <i className="bi-sliders icon-sm" />
                  {t('Advanced Scopes')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateKey}
                  disabled={submitting}
                  className="flex items-center justify-center gap-2"
                >
                  <i className="bi-key icon-sm" />
                  {t('Create API Key')}
                </Button>
              </div>

              {advancedScopesOpen && (
                <div className="bg-bg3 mt-4 rounded-lg p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm">
                    {t('Advanced Scopes')}
                    <HelpTip label={t('Advanced Scopes')}>
                      {t(
                        'Editing scopes directly will turn this key into a custom key.'
                      )}
                    </HelpTip>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {ALL_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className="text-fg1 flex cursor-pointer items-center gap-2 text-sm"
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
              <div className="bg-bg2 rounded-lg p-4">
                <h3 className="text-fg1 mb-2 text-sm font-medium">
                  {t('New API Key')}
                </h3>
                <p className="text-muted mb-3 text-xs">
                  {t('Copy this now. You will not be able to view it again.')}
                </p>
                <div className="flex items-center gap-2">
                  <div className="text-fg1 bg-bg3 flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-sm break-all">
                    {revealedKey}
                  </div>
                  <Button
                    onClick={handleCopyRevealedKey}
                    className="flex items-center gap-2"
                  >
                    <i className="bi-clipboard icon-sm" />
                    {t('Copy')}
                  </Button>
                </div>
              </div>
            )}

            {apiKeys.length === 0 ? (
              <div className="bg-bg2 rounded-lg p-4">
                <p className="text-muted text-sm">
                  {t('You do not have any API keys yet.')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="bg-bg2 rounded-lg p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        {editingId === apiKey.id ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              <div>
                                <label
                                  htmlFor={`edit-api-key-label-${apiKey.id}`}
                                  className="text-muted mb-1.5 block text-sm"
                                >
                                  {t('Label')}
                                </label>
                                <input
                                  id={`edit-api-key-label-${apiKey.id}`}
                                  value={editingLabel}
                                  onChange={(event) =>
                                    setEditingLabel(event.target.value)
                                  }
                                  className="bg-bg3 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`edit-api-key-preset-${apiKey.id}`}
                                  className="text-muted mb-1.5 block text-sm"
                                >
                                  {t('Preset')}
                                </label>
                                <Dropdown
                                  id={`edit-api-key-preset-${apiKey.id}`}
                                  options={API_KEY_PRESETS.map((preset) => ({
                                    value: preset.value,
                                    label: preset.label,
                                  }))}
                                  value={editingPreset}
                                  onChange={(value) => {
                                    setEditingPreset(value);
                                    setEditingScopes(
                                      PRESET_SCOPES[value] ?? []
                                    );
                                  }}
                                  placeholder={t('Select preset')}
                                  containerBackground="bg2"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <Button
                                type="button"
                                onClick={() =>
                                  setEditingAdvancedScopesOpen(
                                    (current) => !current
                                  )
                                }
                                className="flex items-center justify-center gap-2"
                              >
                                <i className="bi-sliders icon-sm" />
                                {t('Advanced Scopes')}
                              </Button>
                              <Button
                                variant="primary"
                                onClick={() => handleRenameKey(apiKey.id)}
                                disabled={submitting}
                              >
                                {t('Save')}
                              </Button>
                              <Button
                                onClick={() => {
                                  setEditingId(null);
                                  setEditingLabel('');
                                  setEditingPreset('full_access');
                                  setEditingScopes([]);
                                  setEditingAdvancedScopesOpen(false);
                                }}
                              >
                                {t('Cancel')}
                              </Button>
                            </div>

                            {editingAdvancedScopesOpen && (
                              <div className="bg-bg3 rounded-lg p-4">
                                <div className="grid gap-2 md:grid-cols-2">
                                  {ALL_SCOPES.map((scope) => (
                                    <label
                                      key={`${apiKey.id}-${scope}`}
                                      className="text-fg1 flex cursor-pointer items-center gap-2 text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editingScopes.includes(scope)}
                                        onChange={() =>
                                          handleEditingScopeToggle(scope)
                                        }
                                      />
                                      {scope}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-fg1 font-medium">{apiKey.label}</p>
                        )}
                        <p className="text-fg2 font-mono text-sm">
                          {formatMaskedKey(apiKey.key_prefix)}
                        </p>
                        <p className="text-muted text-xs">
                          {t('Preset:')}{' '}
                          {API_KEY_PRESETS.find(
                            (preset) => preset.value === apiKey.preset
                          )?.label ?? t('Unknown')}
                        </p>
                        {apiKey.preset === 'custom' && (
                          <p className="text-muted text-xs">
                            {t('Scopes:')} {apiKey.scopes.join(', ')}
                          </p>
                        )}
                        <p className="text-muted text-xs">
                          {t('Created:')} {formatDate(apiKey.created_at)}
                        </p>
                        <p className="text-muted text-xs">
                          {t('Last used:')} {formatDate(apiKey.last_used_at)}
                        </p>
                      </div>

                      {editingId !== apiKey.id && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setEditingId(apiKey.id);
                              setEditingLabel(apiKey.label);
                              setEditingPreset(apiKey.preset);
                              setEditingScopes(apiKey.scopes);
                              setEditingAdvancedScopesOpen(false);
                            }}
                          >
                            {t('Rename')}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => handleDeleteKey(apiKey.id)}
                            disabled={submitting}
                          >
                            {t('Revoke')}
                          </Button>
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
