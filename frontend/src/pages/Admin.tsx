import { t, locale } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import {
  useState,
  useEffect,
  useCallback,
  useDeferredValue,
  useRef,
} from 'react';
import { observeRead } from '../lib/queryClient';
import { useAuth } from '../contexts/AuthContext';
import { listUsers, getAdminStats, deleteUser } from '../lib/admin';
import type { AdminUser, AdminStats } from '../lib/admin';
import {
  getAISettings,
  updateAISettings,
  getLocalSpeechStatus,
} from '../lib/aiSettings';
import { speechPresets, localSpeechModels } from '../lib/speechPresets';
import type { AISettingsResponse } from '../lib/aiSettings';
import type { AISettingsBaseline } from '../lib/adminPageState';
import {
  buildAISettingsUpdatePayload,
  getAISettingsFormValues,
  normalizeAdminUserSearchQuery,
} from '../lib/adminPageState';
import { useToast } from '../hooks/useToast';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import Dropdown from '../components/Dropdown';
import Loading from '../components/Loading';
import CreateUserModal from '../components/CreateUserModal';
import EditUserModal from '../components/EditUserModal';
import Pagination from '../components/Pagination';

const configurationLabels = {
  get configured() {
    return t('Configured');
  },
  get incomplete() {
    return t('Setup needed');
  },
  get unsupported() {
    return t('Unsupported configuration');
  },
  get disabled() {
    return t('Disabled');
  },
};

export default function Admin() {
  useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiNotice, setAiNotice] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [aiModel, setAiModel] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [textEnabled, setTextEnabled] = useState(true);
  const [textKeyless, setTextKeyless] = useState(false);
  const [textProtocol, setTextProtocol] = useState<
    'chat_completions' | 'responses'
  >('chat_completions');
  const [clearTextKey, setClearTextKey] = useState(false);
  const [clearTextEndpoint, setClearTextEndpoint] = useState(false);
  const [speech, setSpeech] = useState({
    enabled: false,
    keyless: false,
    provider: '',
    model: '',
    endpoint: '',
    apiKey: '',
    clearKey: false,
    clearEndpoint: false,
  });
  const speechPreset =
    speech.provider === 'local'
      ? 'local'
      : speech.endpoint.includes('api.openai.com')
        ? 'openai'
        : speech.endpoint.includes('api.groq.com')
          ? 'groq'
          : speech.provider === 'openai' && speech.model === 'whisper-1'
            ? 'openai'
            : speech.model === 'whisper-large-v3-turbo'
              ? 'groq'
              : speech.provider || speech.model || speech.endpoint
                ? 'custom'
                : '';
  const [localStatus, setLocalStatus] = useState('');
  const [checkingLocal, setCheckingLocal] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const aiBaseline = useRef<AISettingsBaseline | null>(null);
  const hasLoadedData = useRef(false);
  const requestId = useRef(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const loadData = useCallback(async () => {
    const ownedRequest = ++requestId.current;
    if (hasLoadedData.current) {
      setUsersLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const normalizedSearchQuery =
        normalizeAdminUserSearchQuery(deferredSearchQuery);
      const [usersData, statsData, aiSettingsData] = await Promise.all([
        listUsers({
          page,
          per_page: perPage,
          query: normalizedSearchQuery,
        }),
        getAdminStats(),
        getAISettings(),
      ]);
      if (ownedRequest !== requestId.current) return;
      setUsers(usersData.items);
      setTotalUsers(usersData.total);
      setTotalPages(usersData.total_pages);
      setStats(statsData);

      setAiSettings(aiSettingsData);

      if (!aiBaseline.current) {
        aiBaseline.current = aiSettingsData;
        const formValues = getAISettingsFormValues(aiSettingsData);
        setAiModel(formValues.model);
        setAiApiKey(formValues.apiKey);
        setAiBaseUrl(formValues.baseUrl);
        setTextEnabled(aiSettingsData.text_enabled);
        setTextKeyless(aiSettingsData.text_keyless);
        setTextProtocol(aiSettingsData.text_protocol);
        setSpeech({
          enabled: aiSettingsData.speech_enabled,
          keyless: aiSettingsData.speech_keyless,
          provider: aiSettingsData.speech_provider || '',
          model: aiSettingsData.speech_model || '',
          endpoint: '',
          apiKey: '',
          clearKey: false,
          clearEndpoint: false,
        });
      }

      setError('');
    } catch (error) {
      if (ownedRequest !== requestId.current) return;
      setError(
        t('Failed to load admin data. You may not have admin privileges.')
      );
      return { error };
    } finally {
      if (ownedRequest === requestId.current) {
        setLoading(false);
        setUsersLoading(false);
        hasLoadedData.current = true;
      }
    }
  }, [deferredSearchQuery, page, perPage]);

  useEffect(() => {
    const stop = observeRead(loadData);
    return () => {
      stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [loadData]);

  function handlePerPageChange(newPerPage: number) {
    setPerPage(newPerPage);
    setPage(1);
  }

  function handleSearchQueryChange(nextQuery: string) {
    setSearchQuery(nextQuery);
    setPage(1);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(locale());
  }

  async function handleDeleteUser(user: AdminUser) {
    if (
      !confirm(
        t('Delete user "{{email}}"? This action cannot be undone.', {
          email: user.email,
        })
      )
    ) {
      return;
    }

    try {
      await deleteUser(user.id);
      await loadData();
    } catch {
      setError(t('Failed to delete user'));
    }
  }

  async function handleSaveAISettings() {
    if (savingAi || !aiBaseline.current) return;
    setSavingAi(true);
    setAiNotice(null);
    const submittedValues: AISettingsBaseline = {
      litellm_model: aiModel || null,
      text_protocol: textProtocol,
      text_enabled: textEnabled,
      text_keyless: textKeyless,
      speech_enabled: speech.enabled,
      speech_keyless: speech.keyless,
      speech_provider: speech.provider || null,
      speech_model: speech.model || null,
    };
    try {
      const updateData = buildAISettingsUpdatePayload(
        {
          ...submittedValues,
          ...(aiApiKey ? { litellm_api_key: aiApiKey } : {}),
          ...(aiBaseUrl ? { litellm_base_url: aiBaseUrl } : {}),
          ...(clearTextKey ? { litellm_api_key: null } : {}),
          ...(clearTextEndpoint ? { litellm_base_url: null } : {}),
          ...(speech.apiKey ? { speech_api_key: speech.apiKey } : {}),
          ...(speech.endpoint ? { speech_endpoint: speech.endpoint } : {}),
          ...(speech.clearKey ? { speech_api_key: null } : {}),
          ...(speech.clearEndpoint ? { speech_endpoint: null } : {}),
        },
        aiBaseline.current
      );
      const updated = await updateAISettings(updateData);
      setAiSettings(updated);
      setLocalStatus('');
      setAiNotice({ error: false, text: t('Settings saved.') });
      // Keep the baseline tied to this form's submitted values.
      aiBaseline.current = submittedValues;
      setAiApiKey('');
      setAiBaseUrl('');
      setClearTextKey(false);
      setClearTextEndpoint(false);
      setSpeech((current) => ({
        ...current,
        apiKey: '',
        endpoint: '',
        clearKey: false,
        clearEndpoint: false,
      }));
      toast.success(t('AI settings saved successfully'));
    } catch {
      setAiNotice({
        error: true,
        text: t(
          'Could not save settings. Check the model and endpoint, then try again. Your changes are kept.'
        ),
      });
      toast.error(t('Could not save AI settings.'));
    } finally {
      setSavingAi(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-primary mb-6 text-2xl font-bold">
          {t('Admin Panel')}
        </h1>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <Loading message={t('Loading admin data...')} />
        ) : (
          <div className="space-y-12">
            <section>
              <h2 className="text-primary mb-6 text-xl font-bold">
                {t('Statistics')}
              </h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="bg-secondary rounded-lg p-6">
                  <h3 className="text-muted mb-1 text-sm">
                    {t('Total Users')}
                  </h3>
                  <p className="text-primary text-3xl font-bold">
                    {stats?.total_users || 0}
                  </p>
                </div>
                <div className="bg-secondary rounded-lg p-6">
                  <h3 className="text-muted mb-1 text-sm">
                    {t('Total Applications')}
                  </h3>
                  <p className="text-primary text-3xl font-bold">
                    {stats?.total_applications || 0}
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="ai-summary-heading">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <h2
                  id="ai-summary-heading"
                  className="text-primary text-xl font-bold"
                >
                  {t('AI Configuration')}
                </h2>
                <button
                  onClick={() => {
                    setAiNotice(null);
                    setShowAISettings(true);
                  }}
                  className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
                >
                  {t('Configure AI')}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="bg-secondary space-y-2 rounded-lg p-6">
                  <h3 className="text-primary text-lg font-semibold">
                    {t('Text Analysis')}
                  </h3>
                  <p className="text-muted text-sm break-words">
                    {aiSettings?.litellm_model || t('No model selected')}
                  </p>
                  <p className="text-muted text-sm">
                    {aiSettings?.text_enabled
                      ? configurationLabels[
                          aiSettings.text.configuration_status
                        ]
                      : t('Disabled')}
                  </p>
                </div>
                <div className="bg-secondary space-y-2 rounded-lg p-6">
                  <h3 className="text-primary text-lg font-semibold">
                    {t('Interview Transcription')}
                  </h3>
                  <p className="text-muted text-sm break-words">
                    {aiSettings?.speech_model || t('No model selected')}
                  </p>
                  <p className="text-muted text-sm">
                    {aiSettings?.speech_enabled
                      ? configurationLabels[
                          aiSettings.speech.configuration_status
                        ]
                      : t('Disabled')}
                  </p>
                </div>
              </div>
              {showAISettings && (
                <Modal
                  label={t('AI Configuration')}
                  onClose={() => setShowAISettings(false)}
                  busy={savingAi}
                >
                  <div className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg p-6">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <h2 className="text-primary text-xl font-bold">
                        {t('AI Configuration')}
                      </h2>
                      <button
                        aria-label={t('Close AI settings')}
                        disabled={savingAi}
                        onClick={() => setShowAISettings(false)}
                        className="text-fg1 hover:bg-bg2 cursor-pointer rounded p-2"
                      >
                        <i className="bi-x-lg icon-lg" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="text-muted mb-4 text-sm">
                      {t(
                        'These settings apply to all users. Leave stored keys and endpoints blank to keep them. Saving does not test the service.'
                      )}
                    </p>
                    {aiNotice && (
                      <p
                        role={aiNotice.error ? 'alert' : 'status'}
                        className={`mb-4 text-sm ${aiNotice.error ? 'text-red-bright' : 'text-green'}`}
                      >
                        {aiNotice.text}
                      </p>
                    )}
                    <form
                      onChange={() => setAiNotice(null)}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSaveAISettings();
                      }}
                    >
                      <fieldset
                        disabled={savingAi}
                        className="grid grid-cols-1 gap-6 md:grid-cols-2"
                      >
                        <div className="space-y-4">
                          <h3 className="text-primary text-lg font-bold">
                            {t('Text Analysis')}
                          </h3>
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={textEnabled}
                              onChange={(e) => setTextEnabled(e.target.checked)}
                            />
                            {t('Enable text processing')}
                          </label>
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={textKeyless}
                              onChange={(e) => setTextKeyless(e.target.checked)}
                            />
                            {t('Text service does not require an API key')}
                          </label>
                          <label className="block">
                            {t('Text model')}
                            <input
                              id="ai-model"
                              className="bg-bg2 text-fg1 mt-1 block w-full rounded px-4 py-2"
                              value={aiModel}
                              onChange={(e) => setAiModel(e.target.value)}
                              placeholder={t('openai/gpt-4o-mini (default)')}
                            />
                          </label>
                          <label className="block">
                            {t('Text protocol')}
                            <Dropdown
                              id="text-protocol"
                              options={[
                                {
                                  value: 'chat_completions',
                                  label: t('Chat Completions'),
                                },
                                {
                                  value: 'responses',
                                  label: t('Responses API'),
                                },
                              ]}
                              value={textProtocol}
                              disabled={savingAi}
                              containerBackground="bg1"
                              onChange={(value) => {
                                setAiNotice(null);
                                setTextProtocol(
                                  value === 'responses'
                                    ? 'responses'
                                    : 'chat_completions'
                                );
                              }}
                            />
                          </label>
                          <label className="block">
                            {t('Text credential')}
                            <input
                              id="ai-api-key"
                              type="password"
                              autoComplete="new-password"
                              disabled={clearTextKey}
                              className="bg-bg2 text-fg1 mt-1 block w-full rounded px-4 py-2"
                              value={aiApiKey}
                              onChange={(e) => setAiApiKey(e.target.value)}
                              placeholder={
                                aiSettings?.litellm_api_key_masked
                                  ? t('Stored — leave blank to keep')
                                  : t('Not stored')
                              }
                            />
                          </label>
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={clearTextKey}
                              onChange={(e) =>
                                setClearTextKey(e.target.checked)
                              }
                            />
                            {t('Clear text credential')}
                          </label>
                          <label className="block">
                            {t('Text endpoint')}
                            <input
                              id="ai-base-url"
                              type="password"
                              autoComplete="new-password"
                              disabled={clearTextEndpoint}
                              className="bg-bg2 text-fg1 mt-1 block w-full rounded px-4 py-2"
                              value={aiBaseUrl}
                              onChange={(e) => setAiBaseUrl(e.target.value)}
                              placeholder={
                                aiSettings?.litellm_endpoint_configured
                                  ? t('Stored — leave blank to keep')
                                  : t('Optional HTTP(S) endpoint')
                              }
                            />
                          </label>
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={clearTextEndpoint}
                              onChange={(e) =>
                                setClearTextEndpoint(e.target.checked)
                              }
                            />
                            {t('Clear text endpoint')}
                          </label>
                          <p className="text-muted text-sm">
                            {t(
                              'Job details, documents and transcripts may be sent to this service when feedback is requested.'
                            )}
                          </p>
                        </div>
                        <div className="space-y-4">
                          <h3 className="text-primary text-lg font-bold">
                            {t('Interview Transcription')}
                          </h3>
                          <label className="block">
                            {t('Apply speech preset')}
                            <Dropdown
                              id="speech-preset"
                              value={speechPreset}
                              placeholder={t('Choose a preset')}
                              disabled={savingAi}
                              containerBackground="bg1"
                              options={[
                                { value: 'local', label: t('Local speech') },
                                { value: 'openai', label: 'OpenAI' },
                                { value: 'groq', label: 'Groq' },
                                {
                                  value: 'custom',
                                  label: t('Custom endpoint'),
                                },
                              ]}
                              onChange={(value) => {
                                const name =
                                  value as keyof typeof speechPresets;
                                if (!name) return;
                                setAiNotice(null);
                                setSpeech({
                                  ...speech,
                                  ...speechPresets[name],
                                  enabled: true,
                                  apiKey: '',
                                  clearKey: true,
                                  clearEndpoint: name === 'custom',
                                });
                                setLocalStatus(
                                  t(
                                    'Preset applied to this form. Save to use these settings.'
                                  )
                                );
                              }}
                            />
                          </label>
                          <p className="text-muted text-sm">
                            {t(
                              'Choosing a preset replaces the speech key when saved. Cloud services receive your audio and may charge for use.'
                            )}
                          </p>
                          {speech.provider === 'local' && (
                            <div className="space-y-2">
                              <p className="text-muted text-sm">
                                {t(
                                  'Install the local speech service on the Tarnished server first. Selecting a model does not download it. Setup instructions:'
                                )}{' '}
                                <code>deploy/compose/LOCAL-SPEECH.md</code>.
                              </p>
                              <button
                                type="button"
                                className="text-fg1 hover:bg-bg2 cursor-pointer rounded-md px-3 py-2 text-sm transition-all duration-200 ease-in-out disabled:opacity-50"
                                disabled={checkingLocal}
                                onClick={async () => {
                                  setCheckingLocal(true);
                                  setLocalStatus(
                                    t('Checking installed models…')
                                  );
                                  try {
                                    const result = await getLocalSpeechStatus();
                                    setLocalStatus(
                                      t(
                                        result.status ===
                                          'installed_unvalidated'
                                          ? 'Model listed in cache. Loading and inference are not verified.'
                                          : result.status === 'not_installed'
                                            ? 'No supported model is installed. Selecting a model does not download it.'
                                            : result.status === 'not_local'
                                              ? 'Save an enabled local configuration first.'
                                              : 'Local service unavailable. Check the installation.'
                                      )
                                    );
                                  } catch {
                                    setLocalStatus(
                                      t(
                                        'Could not check the local service. No transcription was started.'
                                      )
                                    );
                                  } finally {
                                    setCheckingLocal(false);
                                  }
                                }}
                              >
                                {t('Check saved local installation')}
                              </button>
                              <p role="status">{localStatus}</p>
                            </div>
                          )}
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={speech.enabled}
                              onChange={(e) =>
                                setSpeech({
                                  ...speech,
                                  enabled: e.target.checked,
                                })
                              }
                            />
                            {t('Enable speech configuration')}
                          </label>
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={speech.keyless}
                              onChange={(e) =>
                                setSpeech({
                                  ...speech,
                                  keyless: e.target.checked,
                                })
                              }
                            />
                            {t('Speech service does not require an API key')}
                          </label>
                          <label className="block">
                            {t('Speech provider')}
                            <input
                              id="speech-provider"
                              className="bg-bg2 text-fg1 mt-1 block w-full rounded px-4 py-2"
                              value={speech.provider}
                              onChange={(e) =>
                                setSpeech({
                                  ...speech,
                                  provider: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="block">
                            {t('Speech model')}
                            {speech.provider === 'local' ? (
                              <Dropdown
                                id="speech-model"
                                value={speech.model}
                                disabled={savingAi}
                                containerBackground="bg1"
                                options={localSpeechModels.map((option) => ({
                                  value: option.id,
                                  label: option.label,
                                }))}
                                onChange={(value) => {
                                  setAiNotice(null);
                                  setSpeech({ ...speech, model: value });
                                }}
                              />
                            ) : (
                              <input
                                id="speech-model"
                                className="bg-bg2 text-fg1 mt-1 block w-full rounded px-4 py-2"
                                value={speech.model}
                                onChange={(e) =>
                                  setSpeech({
                                    ...speech,
                                    model: e.target.value,
                                  })
                                }
                              />
                            )}
                          </label>
                          <label className="block">
                            {t('Speech credential')}
                            <input
                              id="speech-api-key"
                              type="password"
                              autoComplete="new-password"
                              disabled={speech.provider === 'local'}
                              className="bg-bg2 text-fg1 mt-1 block w-full rounded px-4 py-2"
                              value={speech.apiKey}
                              onChange={(e) =>
                                setSpeech({
                                  ...speech,
                                  apiKey: e.target.value,
                                  clearKey: false,
                                })
                              }
                              placeholder={
                                aiSettings?.speech_api_key_configured
                                  ? t('Stored — leave blank to keep')
                                  : t('Not stored')
                              }
                            />
                          </label>
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={speech.clearKey}
                              onChange={(e) =>
                                setSpeech({
                                  ...speech,
                                  clearKey: e.target.checked,
                                })
                              }
                            />
                            {t('Clear speech credential')}
                          </label>
                          <label className="block">
                            {t('Speech endpoint')}
                            <input
                              id="speech-endpoint"
                              type="password"
                              autoComplete="new-password"
                              disabled={speech.clearEndpoint}
                              className="bg-bg2 text-fg1 mt-1 block w-full rounded px-4 py-2"
                              value={speech.endpoint}
                              onChange={(e) =>
                                setSpeech({
                                  ...speech,
                                  endpoint: e.target.value,
                                })
                              }
                              placeholder={
                                aiSettings?.speech_endpoint_configured
                                  ? t('Stored — leave blank to keep')
                                  : t('Optional HTTP(S) endpoint')
                              }
                            />
                          </label>
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={speech.clearEndpoint}
                              onChange={(e) =>
                                setSpeech({
                                  ...speech,
                                  clearEndpoint: e.target.checked,
                                })
                              }
                            />
                            {t('Clear speech endpoint')}
                          </label>
                        </div>
                        <button
                          type="submit"
                          className="bg-accent text-bg0 hover:bg-accent-bright min-h-11 cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50 md:col-span-2"
                        >
                          {savingAi ? t('Saving...') : t('Save Settings')}
                        </button>
                      </fieldset>
                    </form>
                  </div>
                </Modal>
              )}
            </section>

            <section>
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-primary text-xl font-bold">
                    {t('Users')}
                  </h2>
                  {usersLoading && (
                    <span className="text-muted text-xs">
                      {t('Updating...')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
                >
                  {t('Create User')}
                </button>
              </div>

              <div className="bg-bg1 mb-6 rounded-lg p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <i className="bi-search icon-sm text-muted absolute top-1/2 left-3 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={t('Search by email...')}
                      aria-label={t('Search users')}
                      value={searchQuery}
                      onChange={(e) => handleSearchQueryChange(e.target.value)}
                      className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded py-2 pr-9 pl-9 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => handleSearchQueryChange('')}
                        className="text-muted hover:text-fg1 absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer transition-all duration-200 ease-in-out"
                        aria-label={t('Clear search')}
                      >
                        <i className="bi-x icon-sm" />
                      </button>
                    )}
                  </div>

                  <Dropdown
                    options={[
                      { value: '10', label: t('10 / page') },
                      { value: '25', label: t('25 / page') },
                      { value: '50', label: t('50 / page') },
                      { value: '100', label: t('100 / page') },
                    ]}
                    value={String(perPage)}
                    onChange={(value) => handlePerPageChange(Number(value))}
                    placeholder={t('25 / page')}
                    size="xs"
                    containerBackground="bg1"
                  />
                </div>
              </div>

              <div className="bg-secondary mt-4 hidden overflow-hidden rounded-lg md:block">
                <table className="w-full border-collapse">
                  <colgroup>
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-tertiary border-b">
                      <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                        {t('Email')}
                      </th>
                      <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                        {t('Joined')}
                      </th>
                      <th className="text-muted px-4 py-3 text-center text-xs font-bold tracking-wide uppercase">
                        {t('Admin')}
                      </th>
                      <th className="text-muted px-4 py-3 text-center text-xs font-bold tracking-wide uppercase">
                        {t('Active')}
                      </th>
                      <th className="text-muted px-4 py-3 text-right text-xs font-bold tracking-wide uppercase">
                        {t('Actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-muted px-4 py-8 text-center text-sm"
                        >
                          {searchQuery.trim()
                            ? t('No users match this search.')
                            : t('No users found.')}
                        </td>
                      </tr>
                    ) : (
                      users.map((u, index) => (
                        <tr
                          key={u.id}
                          className={`transition-colors duration-200 ${index < users.length - 1 ? 'border-tertiary border-b' : ''}`}
                        >
                          <td className="text-primary px-4 py-3 text-sm">
                            {u.email.slice(0, u.email.indexOf('@'))}
                            <wbr />
                            <span className="whitespace-nowrap">
                              {u.email.slice(u.email.indexOf('@'))}
                            </span>
                          </td>
                          <td className="text-secondary px-4 py-3 text-sm">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {u.is_admin ? (
                              <span className="bg-purple-bright/20 text-purple-bright inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold">
                                {t('Admin')}
                              </span>
                            ) : (
                              <span className="text-muted text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${
                                u.is_active
                                  ? 'bg-green-bright/20 text-green-bright'
                                  : 'bg-red-bright/20 text-red-bright'
                              }`}
                            >
                              {u.is_active ? t('Active') : t('Inactive')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditingUser(u)}
                                className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-xs transition-all duration-200 ease-in-out"
                              >
                                <i className="bi-pencil icon-xs"></i>
                                {t('Edit')}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="text-red hover:bg-bg2 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-xs transition-all duration-200 ease-in-out"
                              >
                                <i className="bi-trash icon-xs"></i>
                                {t('Delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-3 md:hidden">
                {users.length === 0 ? (
                  <div className="bg-secondary text-muted rounded-lg p-4 text-sm">
                    {searchQuery.trim()
                      ? t('No users match this search.')
                      : t('No users found.')}
                  </div>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="bg-secondary rounded-lg p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <span className="text-primary truncate text-sm font-medium">
                          {u.email}
                        </span>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          {u.is_admin && (
                            <span className="bg-purple-bright/20 text-purple-bright inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold">
                              {t('Admin')}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${
                              u.is_active
                                ? 'bg-green-bright/20 text-green-bright'
                                : 'bg-red-bright/20 text-red-bright'
                            }`}
                          >
                            {u.is_active ? t('Active') : t('Inactive')}
                          </span>
                        </div>
                      </div>
                      <div className="text-secondary mb-3 text-xs">
                        {t('Joined')} {formatDate(u.created_at)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingUser(u)}
                          className="text-fg1 hover:bg-bg2 hover:text-fg0 flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded bg-transparent px-3 py-2 text-xs transition-all duration-200 ease-in-out"
                        >
                          <i className="bi-pencil icon-xs"></i>
                          {t('Edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="text-red hover:bg-bg2 hover:text-red-bright flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded bg-transparent px-3 py-2 text-xs transition-all duration-200 ease-in-out"
                        >
                          <i className="bi-trash icon-xs"></i>
                          {t('Delete')}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  perPage={perPage}
                  totalItems={totalUsers}
                  onPageChange={setPage}
                />
              </div>
            </section>
          </div>
        )}
      </div>

      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={loadData}
      />

      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={loadData}
        currentUserId={user?.id}
      />
    </Layout>
  );
}
