import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listUsers, getAdminStats, deleteUser } from '../lib/admin';
import type { AdminUser, AdminStats } from '../lib/admin';
import { getAISettings, updateAISettings } from '../lib/aiSettings';
import type { AISettingsResponse } from '../lib/aiSettings';
import { useToast } from '../hooks/useToast';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import Loading from '../components/Loading';
import CreateUserModal from '../components/CreateUserModal';
import EditUserModal from '../components/EditUserModal';
import Pagination from '../components/Pagination';

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // AI Settings form state
  const [aiModel, setAiModel] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    loadData();
  }, [page, perPage]);

  async function loadData() {
    setLoading(true);
    try {
      const [usersData, statsData, aiSettingsData] = await Promise.all([
        listUsers({ page, per_page: perPage }),
        getAdminStats(),
        getAISettings(),
      ]);
      setUsers(usersData.items);
      setTotalUsers(usersData.total);
      setTotalPages(usersData.total_pages);
      setStats(statsData);
      setAiSettings(aiSettingsData);

      // Populate form with existing settings
      setAiModel(aiSettingsData.litellm_model || '');
      setAiBaseUrl(aiSettingsData.litellm_base_url || '');
      // Don't populate API key - it's masked for security
    } catch {
      setError('Failed to load admin data. You may not have admin privileges.');
    } finally {
      setLoading(false);
    }
  }

  function handlePerPageChange(newPerPage: number) {
    setPerPage(newPerPage);
    setPage(1); // Reset to first page when changing per-page
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString();
  }

  async function handleDeleteUser(user: AdminUser) {
    if (
      !confirm(`Delete user "${user.email}"? This action cannot be undone.`)
    ) {
      return;
    }

    try {
      await deleteUser(user.id);
      loadData();
    } catch {
      setError('Failed to delete user');
    }
  }

  async function handleSaveAISettings() {
    setSavingAi(true);
    try {
      const updateData: {
        litellm_model?: string | null;
        litellm_api_key?: string | null;
        litellm_base_url?: string | null;
      } = {
        litellm_model: aiModel || null,
        litellm_base_url: aiBaseUrl || null,
      };

      // Only include API key if user entered a new value
      if (aiApiKey) {
        updateData.litellm_api_key = aiApiKey;
      }

      const updated = await updateAISettings(updateData);
      setAiSettings(updated);
      setAiApiKey(''); // Clear the API key field after save
      toast.success('AI settings saved successfully');
    } catch {
      toast.error('Failed to save AI settings');
    } finally {
      setSavingAi(false);
    }
  }

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-primary mb-6 text-2xl font-bold">Admin Panel</h1>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <Loading message="Loading admin data..." />
        ) : (
          <div className="space-y-12">
            <section>
              <h2 className="text-primary mb-6 text-xl font-bold">
                Statistics
              </h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="bg-secondary rounded-lg p-6">
                  <h3 className="text-muted mb-1 text-sm">Total Users</h3>
                  <p className="text-primary text-3xl font-bold">
                    {stats?.total_users || 0}
                  </p>
                </div>
                <div className="bg-secondary rounded-lg p-6">
                  <h3 className="text-muted mb-1 text-sm">
                    Total Applications
                  </h3>
                  <p className="text-primary text-3xl font-bold">
                    {stats?.total_applications || 0}
                  </p>
                </div>
              </div>
            </section>

            {/* AI Configuration Section */}
            <section>
              <div className="mb-6 flex items-center gap-3">
                <i className="bi-robot icon-lg text-accent"></i>
                <h2 className="text-primary text-xl font-bold">
                  AI Configuration
                </h2>
                {aiSettings?.is_configured && (
                  <span className="bg-green-bright/20 text-green-bright inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold">
                    Configured
                  </span>
                )}
              </div>

              <div className="bg-secondary rounded-lg p-6">
                <div className="space-y-4">
                  {/* Model Input */}
                  <div>
                    <label
                      htmlFor="ai-model"
                      className="text-secondary mb-2 block text-sm font-medium"
                    >
                      <i className="bi-cpu icon-xs mr-1.5"></i>
                      Model
                    </label>
                    <input
                      id="ai-model"
                      type="text"
                      placeholder="e.g., gpt-4o, claude-3-sonnet"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-4 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                    />
                    <p className="text-muted mt-1 text-xs">
                      The LiteLLM model identifier for AI features
                    </p>
                  </div>

                  {/* API Key Input */}
                  <div>
                    <label
                      htmlFor="ai-api-key"
                      className="text-secondary mb-2 block text-sm font-medium"
                    >
                      <i className="bi-key icon-xs mr-1.5"></i>
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        id="ai-api-key"
                        type={showApiKey ? 'text' : 'password'}
                        placeholder={
                          aiSettings?.litellm_api_key_masked
                            ? `Current: ${aiSettings.litellm_api_key_masked}`
                            : 'Enter API key'
                        }
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-4 py-2 pr-10 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="text-muted hover:text-fg1 absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-1 transition-all duration-200 ease-in-out"
                        title={showApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        <i
                          className={`bi-${showApiKey ? 'eye-slash' : 'eye'} icon-sm`}
                        ></i>
                      </button>
                    </div>
                    <p className="text-muted mt-1 text-xs">
                      {aiSettings?.litellm_api_key_masked
                        ? 'Leave empty to keep the current API key'
                        : 'The API key will be encrypted and stored securely'}
                    </p>
                  </div>

                  {/* Base URL Input */}
                  <div>
                    <label
                      htmlFor="ai-base-url"
                      className="text-secondary mb-2 block text-sm font-medium"
                    >
                      <i className="bi-globe icon-xs mr-1.5"></i>
                      Base URL{' '}
                      <span className="text-muted font-normal">(optional)</span>
                    </label>
                    <input
                      id="ai-base-url"
                      type="text"
                      placeholder="e.g., http://localhost:4000"
                      value={aiBaseUrl}
                      onChange={(e) => setAiBaseUrl(e.target.value)}
                      className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-4 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                    />
                    <p className="text-muted mt-1 text-xs">
                      Custom endpoint for self-hosted LiteLLM instances
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleSaveAISettings}
                      disabled={savingAi}
                      className="bg-accent text-bg0 hover:bg-accent-bright flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingAi && (
                        <i className="bi-arrow-repeat icon-sm animate-spin"></i>
                      )}
                      {savingAi ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <h2 className="text-primary text-xl font-bold">Users</h2>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
                >
                  Create User
                </button>
              </div>

              {/* Filters */}
              <div className="bg-bg1 mb-6 rounded-lg p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  {/* Search Input */}
                  <div className="relative min-w-0 flex-1">
                    <i className="bi-search icon-sm text-muted absolute top-1/2 left-3 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search by email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded py-2 pr-9 pl-9 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-muted hover:text-fg1 absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer transition-all duration-200 ease-in-out"
                        aria-label="Clear search"
                      >
                        <i className="bi-x icon-sm" />
                      </button>
                    )}
                  </div>

                  {/* Per-page dropdown */}
                  <Dropdown
                    options={[
                      { value: '10', label: '10 / page' },
                      { value: '25', label: '25 / page' },
                      { value: '50', label: '50 / page' },
                      { value: '100', label: '100 / page' },
                    ]}
                    value={String(perPage)}
                    onChange={(value) => handlePerPageChange(Number(value))}
                    placeholder="25 / page"
                    size="xs"
                    containerBackground="bg1"
                  />
                </div>
              </div>

              {/* Desktop table */}
              <div className="bg-secondary mt-4 hidden overflow-hidden rounded-lg md:block">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-tertiary border-b">
                      <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                        Email
                      </th>
                      <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                        Joined
                      </th>
                      <th className="text-muted px-4 py-3 text-center text-xs font-bold tracking-wide uppercase">
                        Admin
                      </th>
                      <th className="text-muted px-4 py-3 text-center text-xs font-bold tracking-wide uppercase">
                        Active
                      </th>
                      <th className="text-muted px-4 py-3 text-right text-xs font-bold tracking-wide uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, index) => (
                      <tr
                        key={u.id}
                        className={`transition-colors duration-200 ${index < filteredUsers.length - 1 ? 'border-tertiary border-b' : ''}`}
                      >
                        <td className="text-primary px-4 py-3 text-sm">
                          {u.email}
                        </td>
                        <td className="text-secondary px-4 py-3 text-sm">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {u.is_admin ? (
                            <span className="bg-purple-bright/20 text-purple-bright inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold">
                              Admin
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
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingUser(u)}
                              className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-xs transition-all duration-200 ease-in-out"
                            >
                              <i className="bi-pencil icon-xs"></i>
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="text-red hover:bg-bg2 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-xs transition-all duration-200 ease-in-out"
                            >
                              <i className="bi-trash icon-xs"></i>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mt-4 space-y-3 md:hidden">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="bg-secondary rounded-lg p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="text-primary truncate text-sm font-medium">
                        {u.email}
                      </span>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        {u.is_admin && (
                          <span className="bg-purple-bright/20 text-purple-bright inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold">
                            Admin
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${
                            u.is_active
                              ? 'bg-green-bright/20 text-green-bright'
                              : 'bg-red-bright/20 text-red-bright'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="text-secondary mb-3 text-xs">
                      Joined {formatDate(u.created_at)}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-fg1 hover:bg-bg2 hover:text-fg0 flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded bg-transparent px-3 py-2 text-xs transition-all duration-200 ease-in-out"
                      >
                        <i className="bi-pencil icon-xs"></i>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="text-red hover:bg-bg2 hover:text-red-bright flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded bg-transparent px-3 py-2 text-xs transition-all duration-200 ease-in-out"
                      >
                        <i className="bi-trash icon-xs"></i>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
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
