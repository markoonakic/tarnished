import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getJobLeads,
  getJobLeadSources,
  type JobLeadListItem,
} from '../lib/jobLeads';
import {
  getJobLeadStatusBadgeClass,
  getJobLeadStatusLabel,
} from '../lib/jobLeadDetailView';
import JobLeadCaptureForm from '../components/JobLeadCaptureForm';
import { parsePositivePageParam } from '../lib/paginationParams';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import JobLeadsFilters, {
  type JobLeadsFiltersValue,
} from '../components/JobLeadsFilters';
import { useToastContext } from '../contexts/ToastContext';
import Pagination from '../components/Pagination';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function JobLeads() {
  const { error: showError } = useToastContext();
  const requestId = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobLeads, setJobLeads] = useState<JobLeadListItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [perPage, setPerPage] = useState(25);

  const page = parsePositivePageParam(searchParams.get('page'));
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const sourceFilter = searchParams.get('source') || '';
  const sortFilter = searchParams.get('sort') || 'newest';

  const debouncedSearch = useDebounce(search, 300);

  const isFiltered = search || statusFilter || sourceFilter;

  const loadJobLeads = useCallback(async () => {
    const ownedRequest = ++requestId.current;
    setLoading(true);
    setListError(false);
    try {
      const params: Record<string, string | number> = {
        page,
        per_page: perPage,
      };
      if (statusFilter) params.status = statusFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      if (sourceFilter) params.source = sourceFilter;
      if (sortFilter) params.sort = sortFilter;

      const data = await getJobLeads(params);
      if (ownedRequest !== requestId.current) return;
      setJobLeads(data.items);
      setTotal(data.total);
    } catch {
      if (ownedRequest !== requestId.current) return;
      setListError(true);
      showError('Failed to load job leads');
    } finally {
      if (ownedRequest === requestId.current) setLoading(false);
    }
  }, [
    page,
    perPage,
    statusFilter,
    debouncedSearch,
    sourceFilter,
    sortFilter,
    showError,
  ]);

  const loadSources = useCallback(async () => {
    try {
      setSources(await getJobLeadSources());
    } catch {
      setSources([]);
    }
  }, []);

  useEffect(() => {
    loadJobLeads();
    return () => {
      // Invalidate retries as well as the initial request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [loadJobLeads]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      });
      if (
        updates.search !== undefined ||
        updates.status !== undefined ||
        updates.source !== undefined ||
        updates.sort !== undefined
      ) {
        newParams.set('page', '1');
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  const handleFiltersChange = useCallback(
    (filters: JobLeadsFiltersValue) => {
      updateParams({
        status: filters.status,
        source: filters.source,
        sort: filters.sort,
      });
      setPerPage(filters.perPage);
    },
    [updateParams]
  );

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  }

  function truncate(str: string | null | undefined, length: number) {
    if (!str) return '-';
    return str.length > length ? str.slice(0, length) + '...' : str;
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-primary text-2xl font-bold">Job Leads</h1>
          <JobLeadCaptureForm onSaved={loadJobLeads} />
        </div>

        <div className="bg-bg1 mb-6 rounded-lg p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <i className="bi-search icon-sm text-muted absolute top-1/2 left-3 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search company or job title..."
                aria-label="Search job leads"
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

            <JobLeadsFilters
              value={{
                status: statusFilter,
                source: sourceFilter,
                sort: sortFilter,
                perPage: perPage,
              }}
              onChange={handleFiltersChange}
              sources={sources}
            />
          </div>
        </div>

        {loading ? (
          <Loading message="Loading job leads..." />
        ) : listError ? (
          <div role="alert" className="text-red-bright">
            Could not refresh the list. This does not undo any saved lead.
            <button
              className="text-accent ml-3 underline"
              onClick={loadJobLeads}
            >
              Reload list
            </button>
          </div>
        ) : jobLeads.length === 0 ? (
          isFiltered ? (
            <EmptyState
              message="No job leads match your search or filters."
              subMessage="Try different keywords or clear filters."
              icon="bi-search"
            />
          ) : (
            <EmptyState
              message="No job leads yet. Add URLs to start tracking job opportunities."
              subMessage="Save a link with New Job Lead to get started."
              icon="bi-bookmark-star"
            />
          )
        ) : (
          <>
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
                      Source
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobLeads.map((lead, index) => {
                    const statusClass = getJobLeadStatusBadgeClass(lead.status);
                    return (
                      <tr
                        key={lead.id}
                        className={`transition-all duration-200 ease-in-out ${
                          index < jobLeads.length - 1
                            ? 'border-tertiary border-b'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-sm">
                          <Link
                            to={`/job-leads/${lead.id}`}
                            className="text-fg1 hover:text-accent-bright cursor-pointer font-medium transition-all duration-200 ease-in-out"
                          >
                            {lead.company || truncate(lead.url, 40)}
                          </Link>
                        </td>
                        <td className="text-primary px-4 py-3 text-sm">
                          {lead.title || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                          >
                            <span className="h-2 w-2 rounded-full bg-current" />
                            {getJobLeadStatusLabel(lead.status)}
                          </span>
                        </td>
                        <td className="text-secondary px-4 py-3 text-sm">
                          {lead.source || '-'}
                        </td>
                        <td className="text-secondary px-4 py-3 text-sm">
                          {formatDate(lead.scraped_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {jobLeads.map((lead) => {
                const statusClass = getJobLeadStatusBadgeClass(lead.status);
                return (
                  <Link
                    key={lead.id}
                    to={`/job-leads/${lead.id}`}
                    className="bg-secondary hover:bg-bg2 block cursor-pointer rounded-lg p-4 transition-all duration-200 ease-in-out"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="text-fg1 truncate font-medium">
                        {lead.company || truncate(lead.url, 30)}
                      </span>
                      <span
                        className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                      >
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {getJobLeadStatusLabel(lead.status)}
                      </span>
                    </div>
                    <div className="text-primary mb-2 truncate text-sm">
                      {lead.title || 'No title'}
                    </div>
                    <div className="text-secondary text-xs">
                      {formatDate(lead.scraped_at)}
                      {lead.source && ` · ${lead.source}`}
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-6">
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(total / perPage)}
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
    </Layout>
  );
}
