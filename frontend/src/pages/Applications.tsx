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
    if (
      updates.status !== undefined ||
      updates.search !== undefined ||
      updates.source !== undefined
    ) {
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
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-primary text-2xl font-bold">Applications</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
          >
            New Application
          </button>
        </div>

        <div className="bg-bg1 mb-6 rounded-lg p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {/* Search Input */}
            <div className="relative min-w-0 flex-1">
              <i className="bi-search icon-sm text-muted absolute top-1/2 left-3 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search company or job title..."
                value={search}
                onChange={(e) => updateParams({ search: e.target.value })}
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded py-2 pr-9 pl-9 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => updateParams({ search: '' })}
                  className="text-muted hover:text-fg1 absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer transition-all duration-200 ease-in-out"
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
                  ...statuses.map((status) => ({
                    value: status.id,
                    label: status.name,
                  })),
                ]}
                value={statusFilter}
                onChange={(value) => updateParams({ status: value })}
                placeholder="All Statuses"
                size="xs"
                containerBackground="bg1"
              />
              <Dropdown
                options={[
                  { value: '', label: 'All Sources' },
                  ...sources.map((source) => ({
                    value: source,
                    label: source,
                  })),
                ]}
                value={sourceFilter}
                onChange={(value) => updateParams({ source: value })}
                placeholder="All Sources"
                size="xs"
                containerBackground="bg1"
                disabled={sources.length === 0}
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
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
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
                label: 'Add Application',
                onClick: () => setShowCreateModal(true),
              }}
            />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="bg-secondary hidden overflow-hidden rounded-lg md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-tertiary border-b">
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      Company
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      Position
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      Status
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      Applied
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      Rounds
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app, index) => (
                    <tr
                      key={app.id}
                      className={`transition-colors duration-200 ${index < applications.length - 1 ? 'border-tertiary border-b' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm">
                        <Link
                          to={`/applications/${app.id}`}
                          className="text-fg1 hover:text-accent-bright font-medium transition-all duration-200 ease-in-out"
                        >
                          {app.company}
                        </Link>
                      </td>
                      <td className="text-primary px-4 py-3 text-sm">
                        {app.job_title}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold"
                          style={{
                            backgroundColor: `${getStatusColor(app.status.name, colors, app.status.color)}20`,
                            color: getStatusColor(
                              app.status.name,
                              colors,
                              app.status.color
                            ),
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: getStatusColor(
                                app.status.name,
                                colors,
                                app.status.color
                              ),
                            }}
                          />
                          {app.status.name}
                        </span>
                      </td>
                      <td className="text-secondary px-4 py-3 text-sm">
                        {formatDate(app.applied_at)}
                      </td>
                      <td className="text-secondary px-4 py-3 text-sm">
                        {app.rounds?.length || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {applications.map((app) => (
                <Link
                  key={app.id}
                  to={`/applications/${app.id}`}
                  className="bg-secondary hover:bg-bg2 block cursor-pointer rounded-lg p-4 transition-all duration-200 ease-in-out"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="text-fg1 truncate font-medium">
                      {app.company}
                    </span>
                    <span
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: `${getStatusColor(app.status.name, colors, app.status.color)}20`,
                        color: getStatusColor(
                          app.status.name,
                          colors,
                          app.status.color
                        ),
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: getStatusColor(
                            app.status.name,
                            colors,
                            app.status.color
                          ),
                        }}
                      />
                      {app.status.name}
                    </span>
                  </div>
                  <div className="text-primary mb-2 truncate text-sm">
                    {app.job_title}
                  </div>
                  <div className="text-secondary text-xs">
                    {formatDate(app.applied_at)} · {app.rounds?.length || 0}{' '}
                    rounds
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
                onPageChange={(newPage) =>
                  updateParams({ page: String(newPage) })
                }
              />
            </div>
          </>
        )}
      </div>
      <ApplicationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(applicationId) =>
          navigate(`/applications/${applicationId}`)
        }
      />
    </Layout>
  );
}
