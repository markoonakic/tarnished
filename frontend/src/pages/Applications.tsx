import { useState, useEffect, useMemo } from 'react';
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
import Pagination from '../components/Pagination';

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

  // Compute unique sources from applications
  const sources = useMemo(() => {
    const uniqueSources = new Set<string>();
    applications.forEach((app) => {
      if (app.source) {
        uniqueSources.add(app.source);
      }
    });
    return Array.from(uniqueSources).sort();
  }, [applications]);

  const page = parseInt(searchParams.get('page') || '1');
  const [perPage, setPerPage] = useState(25);
  const statusFilter = searchParams.get('status') || '';
  const sourceFilter = searchParams.get('source') || '';
  const search = searchParams.get('search') || '';
  const isFiltered = search || statusFilter || sourceFilter;

  useEffect(() => {
    loadStatuses();
  }, []);

  useEffect(() => {
    loadApplications();
  }, [page, perPage, statusFilter, sourceFilter, search]);

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
      if (sourceFilter) params.source = sourceFilter;
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
    if (updates.status !== undefined || updates.search !== undefined || updates.source !== undefined) {
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

        <div className="bg-bg1 rounded-lg p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Search Input */}
            <div className="flex-1 min-w-0 relative">
              <i className="bi-search absolute left-3 top-1/2 -translate-y-1/2 icon-sm text-muted" />
              <input
                type="text"
                placeholder="Search company or job title..."
                value={search}
                onChange={(e) => updateParams({ search: e.target.value })}
                className="w-full pl-9 pr-9 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />
              {search && (
                <button
                  onClick={() => updateParams({ search: '' })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg1 transition-all duration-200 ease-in-out cursor-pointer"
                  aria-label="Clear search"
                >
                  <i className="bi-x icon-sm" />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
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
                disabled={applications.length === 0}
              />
              <Dropdown
                options={[
                  { value: '', label: 'All Sources' },
                  ...sources.map((source) => ({ value: source, label: source }))
                ]}
                value={sourceFilter}
                onChange={(value) => updateParams({ source: value })}
                placeholder="All Sources"
                size="xs"
                containerBackground="bg1"
                disabled={applications.length === 0 || sources.length === 0}
              />
              <Dropdown
                options={[
                  { value: '10', label: '10 / page' },
                  { value: '25', label: '25 / page' },
                  { value: '50', label: '50 / page' },
                  { value: '100', label: '100 / page' },
                ]}
                value={String(perPage)}
                onChange={(value) => {
                  setPerPage(Number(value));
                  updateParams({ page: '1' });
                }}
                placeholder="25 / page"
                size="xs"
                containerBackground="bg1"
                disabled={applications.length === 0}
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

            <div className="mt-6">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                perPage={perPage}
                totalItems={total}
                onPageChange={(newPage) => updateParams({ page: String(newPage) })}
              />
            </div>
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
