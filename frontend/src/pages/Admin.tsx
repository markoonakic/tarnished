import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listUsers, getAdminStats, deleteUser } from '../lib/admin';
import type { User, AdminStats } from '../lib/admin';
import Layout from '../components/Layout';
import Loading from '../components/Loading';
import CreateUserModal from '../components/CreateUserModal';
import EditUserModal from '../components/EditUserModal';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [usersData, statsData] = await Promise.all([
        listUsers(),
        getAdminStats(),
      ]);
      setUsers(usersData);
      setStats(statsData);
    } catch {
      setError('Failed to load admin data. You may not have admin privileges.');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString();
  }

  async function handleDeleteUser(user: User) {
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

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Admin Panel</h1>

        {error && (
          <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded mb-6">
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
                <div className="bg-secondary border border-tertiary rounded-lg p-6">
                  <h3 className="text-muted text-sm mb-1">Total Users</h3>
                  <p className="text-3xl font-bold text-primary">{stats?.total_users || 0}</p>
                </div>
                <div className="bg-secondary border border-tertiary rounded-lg p-6">
                  <h3 className="text-muted text-sm mb-1">Total Applications</h3>
                  <p className="text-3xl font-bold text-primary">{stats?.total_applications || 0}</p>
                </div>
              </div>
            </section>

            <section>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-primary">Users</h2>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright transition-all duration-200 cursor-pointer"
                >
                  Create User
                </button>
              </div>

              <input
                type="text"
                placeholder="Search by email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-tertiary rounded text-primary placeholder-muted focus:outline-none focus:border-aqua-bright transition-colors duration-200 ease-out"
              />

              <div className="bg-secondary border border-tertiary rounded-lg overflow-hidden">
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
                      <tr key={u.id} className={`${index === filteredUsers.length - 1 ? '' : 'border-b border-tertiary'} transition-colors duration-200`}>
                        <td className="py-3 px-4 text-sm text-primary">{u.email}</td>
                        <td className="py-3 px-4 text-sm text-secondary">{formatDate(u.created_at)}</td>
                        <td className="py-3 px-4 text-sm text-center">
                          {u.is_admin ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-accent-purple/20 text-accent-purple">
                              Admin
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${
                            u.is_active
                              ? 'bg-accent-green/20 text-accent-green'
                              : 'bg-accent-red/20 text-accent-red'
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
                              <i className="bi-pencil text-xs"></i>
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="px-3 py-1.5 bg-transparent text-red text-xs rounded hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out flex items-center gap-1.5 cursor-pointer"
                            >
                              <i className="bi-trash text-xs"></i>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
