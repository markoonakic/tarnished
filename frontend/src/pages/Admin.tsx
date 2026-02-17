import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listUsers, getAdminStats, deleteUser } from '../lib/admin';
import type { AdminUser, AdminStats } from '../lib/admin';
import { getAISettings, updateAISettings } from '../lib/aiSettings';
import type { AISettingsResponse } from '../lib/aiSettings';
import { useToast } from '../hooks/useToast';
import Layout from '../components/Layout';
import Loading from '../components/Loading';
import CreateUserModal from '../components/CreateUserModal';
import EditUserModal from '../components/EditUserModal';

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

  // AI Settings form state
  const [aiModel, setAiModel] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [usersData, statsData, aiSettingsData] = await Promise.all([
        listUsers(),
        getAdminStats(),
        getAISettings(),
      ]);
      setUsers(usersData);
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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString();
  }

  async function handleDeleteUser(user: AdminUser) {
    if (!confirm(`Delete user "${user.email}"? This action cannot be undone.`)) {
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

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Admin Panel</h1>

        {error && (
          <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <Loading message="Loading admin data..." />
        ) : (
          <div className="space-y-12">
            <section>
              <h2 className="text-xl font-bold text-primary mb-6">Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-secondary rounded-lg p-6">
                  <h3 className="text-muted text-sm mb-1">Total Users</h3>
                  <p className="text-3xl font-bold text-primary">{stats?.total_users || 0}</p>
                </div>
                <div className="bg-secondary rounded-lg p-6">
                  <h3 className="text-muted text-sm mb-1">Total Applications</h3>
                  <p className="text-3xl font-bold text-primary">{stats?.total_applications || 0}</p>
                </div>
              </div>
            </section>

            {/* AI Configuration Section */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <i className="bi-robot icon-lg text-accent"></i>
                <h2 className="text-xl font-bold text-primary">AI Configuration</h2>
                {aiSettings?.is_configured && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-green-bright/20 text-green-bright">
                    Configured
                  </span>
                )}
              </div>

              <div className="bg-secondary rounded-lg p-6">
                <div className="space-y-4">
                  {/* Model Input */}
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      <i className="bi-cpu icon-xs mr-1.5"></i>
                      Model
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., gpt-4o, claude-3-sonnet"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full px-4 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                    />
                    <p className="text-xs text-muted mt-1">
                      The LiteLLM model identifier for AI features
                    </p>
                  </div>

                  {/* API Key Input */}
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      <i className="bi-key icon-xs mr-1.5"></i>
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        placeholder={aiSettings?.litellm_api_key_masked ? `Current: ${aiSettings.litellm_api_key_masked}` : 'Enter API key'}
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        className="w-full px-4 py-2 pr-10 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-fg1 transition-all duration-200 ease-in-out cursor-pointer"
                        title={showApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        <i className={`bi-${showApiKey ? 'eye-slash' : 'eye'} icon-sm`}></i>
                      </button>
                    </div>
                    <p className="text-xs text-muted mt-1">
                      {aiSettings?.litellm_api_key_masked
                        ? 'Leave empty to keep the current API key'
                        : 'The API key will be encrypted and stored securely'}
                    </p>
                  </div>

                  {/* Base URL Input */}
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      <i className="bi-globe icon-xs mr-1.5"></i>
                      Base URL <span className="text-muted font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., http://localhost:4000"
                      value={aiBaseUrl}
                      onChange={(e) => setAiBaseUrl(e.target.value)}
                      className="w-full px-4 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                    />
                    <p className="text-xs text-muted mt-1">
                      Custom endpoint for self-hosted LiteLLM instances
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleSaveAISettings}
                      disabled={savingAi}
                      className="bg-accent text-bg0 hover:bg-accent-bright disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer flex items-center gap-2"
                    >
                      {savingAi && <i className="bi-arrow-repeat icon-sm animate-spin"></i>}
                      {savingAi ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-primary">Users</h2>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
                >
                  Create User
                </button>
              </div>

              <input
                type="text"
                placeholder="Search by email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />

              {/* Desktop table */}
              <div className="hidden md:block bg-secondary rounded-lg overflow-hidden mt-4">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-tertiary">
                      <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Email</th>
                      <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Joined</th>
                      <th className="text-center py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Admin</th>
                      <th className="text-center py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Active</th>
                      <th className="text-right py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, index) => (
                      <tr key={u.id} className={`transition-colors duration-200 ${index < filteredUsers.length - 1 ? 'border-b border-tertiary' : ''}`}>
                        <td className="py-3 px-4 text-sm text-primary">{u.email}</td>
                        <td className="py-3 px-4 text-sm text-secondary">{formatDate(u.created_at)}</td>
                        <td className="py-3 px-4 text-sm text-center">
                          {u.is_admin ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-purple-bright/20 text-purple-bright">
                              Admin
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${
                            u.is_active
                              ? 'bg-green-bright/20 text-green-bright'
                              : 'bg-red-bright/20 text-red-bright'
                          }`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingUser(u)}
                              className="px-3 py-1.5 bg-transparent text-fg1 text-xs rounded hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out flex items-center gap-1.5 cursor-pointer"
                            >
                              <i className="bi-pencil icon-xs"></i>
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="px-3 py-1.5 bg-transparent text-red text-xs rounded hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out flex items-center gap-1.5 cursor-pointer"
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
              <div className="md:hidden space-y-3 mt-4">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="bg-secondary rounded-lg p-4">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-sm text-primary font-medium truncate">{u.email}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {u.is_admin && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-purple-bright/20 text-purple-bright">
                            Admin
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${
                          u.is_active
                            ? 'bg-green-bright/20 text-green-bright'
                            : 'bg-red-bright/20 text-red-bright'
                        }`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-secondary mb-3">
                      Joined {formatDate(u.created_at)}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="flex-1 px-3 py-2 bg-transparent text-fg1 text-xs rounded hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <i className="bi-pencil icon-xs"></i>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="flex-1 px-3 py-2 bg-transparent text-red text-xs rounded hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <i className="bi-trash icon-xs"></i>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
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
