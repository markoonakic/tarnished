import { t, locale } from '@/lib/i18n';
import ApplicationBoard from '@/components/ApplicationBoard';
import ApplicationsViewSwitch from '../components/slots/ApplicationsViewSwitch';
import { statusLabel } from '@/lib/referenceLabels';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useRef } from 'react';
import { observeRead } from '../lib/queryClient';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { getApplicationSources, listApplications } from '../lib/applications';
import type { ListParams } from '../lib/applications';
import { parsePositivePageParam } from '../lib/paginationParams';
import { listStatuses } from '../lib/settings';
import type { ApplicationSummary, Status } from '../lib/types';
import { getStatusColor } from '../lib/statusColors';
import { useThemeColors } from '../hooks/useThemeColors';
import { useToastContext } from '../contexts/ToastContext';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import ApplicationModal from '../components/ApplicationModal';
import Pagination from '../components/Pagination';

const sortOptions = [
  {
    value: 'applied_desc',
    get label() {
      return t('Applied: newest first');
    },
  },
  {
    value: 'applied_asc',
    get label() {
      return t('Applied: oldest first');
    },
  },
  {
    value: 'company',
    get label() {
      return t('Company: A–Z');
    },
  },
  {
    value: 'status',
    get label() {
      return t('Status: A–Z');
    },
  },
  {
    value: 'updated',
    get label() {
      return t('Last updated');
    },
  },
];

export default function Applications() {
  useTranslation();
  const navigate = useNavigate();
  const colors = useThemeColors();
  const toast = useToastContext();
  const { error: showError } = toast;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestId = useRef(0);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const page = parsePositivePageParam(searchParams.get('page'));
  const [perPage, setPerPage] = useState(25);
  const statusFilter = searchParams.get('status') || '';
  const sourceFilter = searchParams.get('source') || '';
  const search = searchParams.get('search') || '';
  const sort =
    sortOptions.find((option) => option.value === searchParams.get('sort'))
      ?.value ?? 'applied_desc';
  const isFiltered = search || statusFilter || sourceFilter;

  const loadStatuses = useCallback(async () => {
    try {
      const data = await listStatuses();
      setStatuses(data);
    } catch (error) {
      return { error }; // Optional filters can recover without blocking the list.
    }
  }, []);

  const loadApplications = useCallback(async () => {
    const ownedRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const params: ListParams = { page, per_page: perPage };
      if (statusFilter) params.status_id = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (search) params.search = search;
      if (sort !== 'applied_desc') params.sort = sort;

      const data = await listApplications(params);
      if (ownedRequest !== requestId.current) return;
      setApplications(data.items);
      setTotal(data.total);
    } catch (error) {
      if (ownedRequest !== requestId.current) return;
      const errorMsg = t('Failed to load applications');
      setError(errorMsg);
      showError(errorMsg);
      return { error };
    } finally {
      if (ownedRequest === requestId.current) setLoading(false);
    }
  }, [page, perPage, statusFilter, sourceFilter, search, sort, showError]);

  const loadSources = useCallback(async () => {
    try {
      setSources(await getApplicationSources());
    } catch (error) {
      setSources([]);
      return { error };
    }
  }, []);

  useEffect(() => observeRead(loadStatuses), [loadStatuses]);

  useEffect(() => {
    const stop = observeRead(loadApplications);
    return () => {
      stop();
      // Invalidate the current generation, including retries started after this effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [loadApplications]);

  useEffect(() => observeRead(loadSources), [loadSources]);

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
      updates.source !== undefined ||
      updates.sort !== undefined
    ) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  }

  const totalPages = Math.ceil(total / perPage);

  function formatDate(dateStr: string) {
    // Applied dates are calendar dates, not instants in the device zone.
    return new Date(dateStr).toLocaleDateString(locale(), { timeZone: 'UTC' });
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-primary text-2xl font-bold">
            {t('Applications')}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <ApplicationsViewSwitch
              view={searchParams.get('view') === 'board' ? 'board' : 'list'}
              onChange={(view) => updateParams({ view })}
            />
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
            >
              {t('New Application')}
            </button>
          </div>
        </div>

        <div className="bg-bg1 mb-6 rounded-lg p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {/* Search Input */}
            <div className="relative min-w-0 flex-1">
              <i className="bi-search icon-sm text-muted absolute top-1/2 left-3 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('Search company or job title...')}
                aria-label={t('Search applications')}
                value={search}
                onChange={(e) => updateParams({ search: e.target.value })}
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded py-2 pr-9 pl-9 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => updateParams({ search: '' })}
                  className="text-muted hover:text-fg1 absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer transition-all duration-200 ease-in-out"
                  aria-label={t('Clear search')}
                >
                  <i className="bi-x icon-sm" />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Dropdown
                options={[
                  { value: '', label: t('All Statuses') },
                  ...statuses.map((status) => ({
                    value: status.id,
                    label: statusLabel(status),
                  })),
                ]}
                value={statusFilter}
                onChange={(value) => updateParams({ status: value })}
                placeholder={t('All Statuses')}
                size="xs"
                containerBackground="bg1"
              />
              <Dropdown
                options={[
                  { value: '', label: t('All Sources') },
                  ...sources.map((source) => ({
                    value: source,
                    label: source,
                  })),
                ]}
                value={sourceFilter}
                onChange={(value) => updateParams({ source: value })}
                placeholder={t('All Sources')}
                size="xs"
                containerBackground="bg1"
                disabled={sources.length === 0}
              />
              <Dropdown
                options={sortOptions}
                value={sort}
                onChange={(value) => updateParams({ sort: value })}
                placeholder={t('Sort applications')}
                size="xs"
                containerBackground="bg1"
              />
              <Dropdown
                options={[
                  { value: '10', label: t('10 / page') },
                  { value: '25', label: t('25 / page') },
                  { value: '50', label: t('50 / page') },
                  { value: '100', label: t('100 / page') },
                ]}
                value={String(perPage)}
                onChange={(value) => {
                  setPerPage(Number(value));
                  updateParams({ page: '1' });
                }}
                placeholder={t('25 / page')}
                size="xs"
                containerBackground="bg1"
              />
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3"
          >
            {error}
            <button
              type="button"
              onClick={loadApplications}
              className="ml-3 underline"
            >
              {t('Retry')}
            </button>
          </div>
        )}

        {searchParams.get('view') === 'board' ? (
          <ApplicationBoard params={searchParams} />
        ) : loading ? (
          <Loading message={t('Loading applications...')} />
        ) : error ? null : applications.length === 0 ? (
          isFiltered ? (
            <EmptyState
              message={t('No applications match your search or filters.')}
              subMessage={t('Try different keywords or clear filters.')}
              icon="bi-search"
            />
          ) : (
            <EmptyState
              message={t(
                'No applications yet. Add your first application to get started.'
              )}
              icon="bi-inbox"
              action={{
                label: t('Add Application'),
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
                      {t('Company')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('Position')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('Status')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('Applied')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('Rounds')}
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
                          {statusLabel(app.status)}
                        </span>
                      </td>
                      <td className="text-secondary px-4 py-3 text-sm">
                        {formatDate(app.applied_at)}
                      </td>
                      <td className="text-secondary px-4 py-3 text-sm">
                        {app.round_count}
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
                      {statusLabel(app.status)}
                    </span>
                  </div>
                  <div className="text-primary mb-2 truncate text-sm">
                    {app.job_title}
                  </div>
                  <div className="text-secondary text-xs">
                    {formatDate(app.applied_at)} ·{' '}
                    {t('roundCount', { count: app.round_count })}
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
