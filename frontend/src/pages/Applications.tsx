import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listApplications } from '../lib/applications';
import type { ListParams } from '../lib/applications';
import { listStatuses } from '../lib/settings';
import type { Application, Status } from '../lib/types';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function Applications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [applications, setApplications] = useState<Application[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      console.error('Failed to load statuses');
    }
  }

  async function loadApplications() {
    setLoading(true);
    try {
      const params: ListParams = { page, per_page: perPage };
      if (statusFilter) params.status_id = statusFilter;
      if (search) params.search = search;

      const data = await listApplications(params);
      setApplications(data.items);
      setTotal(data.total);
    } catch {
      setError('Failed to load applications');
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Applications</h1>
          <Link
            to="/applications/new"
            className="bg-aqua text-bg0 hover:bg-aqua-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
          >
            New Application
          </Link>
        </div>

        <div className="bg-secondary rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search company or job title..."
                value={search}
                onChange={(e) => updateParams({ search: e.target.value })}
                className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:border-aqua-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
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
                containerBackground="bg1"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded mb-6">
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
                onClick: () => window.location.href = '/applications/new'
              }}
            />
          )
        ) : (
          <>
            <div className="bg-secondary rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
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
                          className="text-fg1 hover:text-aqua-bright transition-colors duration-100 ease-in-out font-medium"
                        >
                          {app.company}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-primary">{app.job_title}</td>
                      <td className="py-3 px-4 text-sm">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: `${app.status.color}20`,
                            color: app.status.color,
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: app.status.color }}
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
    </Layout>
  );
}
