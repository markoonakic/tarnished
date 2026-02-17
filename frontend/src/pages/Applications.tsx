import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { listApplications } from '../lib/applications';
import type { ListParams } from '../lib/applications';
import { listStatuses } from '../lib/settings';
import type { Application, Status } from '../lib/types';
import { getStatusColor } from '../lib/statusColors';
import { useThemeColors } from '../hooks/useThemeColors';
import { useToastContext } from '../contexts/ToastContext';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import ApplicationModal from '../components/ApplicationModal';

export default function Applications() {
  const navigate = useNavigate();
  const colors = useThemeColors();
  const toast = useToastContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [applications, setApplications] = useState<Application[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const page = parseInt(searchParams.get('page') || '1');
  const perPage = 10;
  const statusFilter = searchParams.get('status') || '';
  const search = searchParams.get('search') || '';
  const isFiltered = search || statusFilter;

  useEffect(() => {
    loadStatuses();
  }, []);

  useEffect(() => {
    loadApplications();
  }, [page, statusFilter, search]);

  async function loadStatuses() {
    try {
      const data = await listStatuses();
      setStatuses(data);
    } catch {
      // statuses are optional for filtering
    }
  }

  async function loadApplications() {
    setLoading(true);
    setError('');
    try {
      const params: ListParams = { page, per_page: perPage };
      if (statusFilter) params.status_id = statusFilter;
      if (search) params.search = search;

      const data = await listApplications(params);
      setApplications(data.items);
      setTotal(data.total);
    } catch {
      const errorMsg = 'Failed to load applications';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  function updateParams(updates: Record<string, string>) {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    if (updates.status !== undefined || updates.search !== undefined) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  }

  const totalPages = Math.ceil(total / perPage);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-primary">Applications</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
          >
            New Application
          </button>
        </div>

        <div className="bg-secondary rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <input
                type="text"
                placeholder="Search company or job title..."
                value={search}
                onChange={(e) => updateParams({ search: e.target.value })}
                className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />
            </div>
            <div>
              <Dropdown
                options={[
                  { value: '', label: 'All Statuses' },
                  ...statuses.map((status) => ({ value: status.id, label: status.name }))
                ]}
                value={statusFilter}
                onChange={(value) => updateParams({ status: value })}
                placeholder="All Statuses"
                size="xs"
                containerBackground="bg1"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <Loading message="Loading applications..." />
        ) : applications.length === 0 ? (
          isFiltered ? (
            <EmptyState
              message="No applications match your search or filters."
              subMessage="Try different keywords or clear filters."
              icon="bi-search"
            />
          ) : (
            <EmptyState
              message="No applications yet. Add your first application to get started."
              icon="bi-inbox"
              action={{
                label: "Add Application",
                onClick: () => setShowCreateModal(true)
              }}
            />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-secondary rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-tertiary">
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Company</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Position</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Applied</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Rounds</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app, index) => (
                    <tr key={app.id} className={`transition-colors duration-200 ${index < applications.length - 1 ? 'border-b border-tertiary' : ''}`}>
                      <td className="py-3 px-4 text-sm">
                        <Link
                          to={`/applications/${app.id}`}
                          className="text-fg1 hover:text-accent-bright transition-all duration-200 ease-in-out font-medium"
                        >
                          {app.company}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-primary">{app.job_title}</td>
                      <td className="py-3 px-4 text-sm">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: `${getStatusColor(app.status.name, colors, app.status.color)}20`,
                            color: getStatusColor(app.status.name, colors, app.status.color),
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getStatusColor(app.status.name, colors, app.status.color) }}
                          />
                          {app.status.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-secondary">{formatDate(app.applied_at)}</td>
                      <td className="py-3 px-4 text-sm text-secondary">{app.rounds?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {applications.map((app) => (
                <Link
                  key={app.id}
                  to={`/applications/${app.id}`}
                  className="block bg-secondary rounded-lg p-4 hover:bg-bg2 transition-all duration-200 ease-in-out cursor-pointer"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-fg1 font-medium truncate">{app.company}</span>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: `${getStatusColor(app.status.name, colors, app.status.color)}20`,
                        color: getStatusColor(app.status.name, colors, app.status.color),
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getStatusColor(app.status.name, colors, app.status.color) }}
                      />
                      {app.status.name}
                    </span>
                  </div>
                  <div className="text-sm text-primary truncate mb-2">{app.job_title}</div>
                  <div className="text-xs text-secondary">
                    {formatDate(app.applied_at)} · {app.rounds?.length || 0} rounds
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  onClick={() => updateParams({ page: String(page - 1) })}
                  disabled={page === 1}
                  className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-sm text-muted font-mono px-4">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => updateParams({ page: String(page + 1) })}
                  disabled={page === totalPages}
                  className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <ApplicationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(applicationId) => navigate(`/applications/${applicationId}`)}
      />
    </Layout>
  );
}
