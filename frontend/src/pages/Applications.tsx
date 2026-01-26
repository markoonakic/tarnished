import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listApplications } from '../lib/applications';
import type { ListParams } from '../lib/applications';
import { listStatuses } from '../lib/settings';
import type { Application, Status } from '../lib/types';
import Layout from '../components/Layout';

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
            className="px-4 py-2 bg-accent-aqua text-bg-primary rounded font-medium hover:opacity-90 disabled:opacity-50 transition-all duration-200"
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
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => updateParams({ status: e.target.value })}
                className="px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
              >
                <option value="">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted">Loading...</div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-muted">
            No applications found. Create your first one!
          </div>
        ) : (
          <>
            <div className="bg-secondary rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-tertiary">
                  <tr>
                    <th className="px-4 py-3 text-left text-muted text-sm font-medium">Company</th>
                    <th className="px-4 py-3 text-left text-muted text-sm font-medium">Position</th>
                    <th className="px-4 py-3 text-left text-muted text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-muted text-sm font-medium">Applied</th>
                    <th className="px-4 py-3 text-left text-muted text-sm font-medium">Rounds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tertiary">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-tertiary/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/applications/${app.id}`}
                          className="text-accent-aqua hover:underline font-medium"
                        >
                          {app.company}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-primary">{app.job_title}</td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-1 rounded text-sm font-medium"
                          style={{
                            backgroundColor: `${app.status.color}20`,
                            color: app.status.color,
                          }}
                        >
                          {app.status.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-secondary">{formatDate(app.applied_at)}</td>
                      <td className="px-4 py-3 text-secondary">{app.rounds?.length || 0}</td>
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
                  className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200"
                >
                  Previous
                </button>
                <span className="text-secondary px-4">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => updateParams({ page: String(page + 1) })}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200"
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
