import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getJobLeads } from '../lib/jobLeads';
import type { JobLead, JobLeadStatus } from '../lib/types';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';
import JobLeadsFilters, { type JobLeadsFiltersValue } from '../components/JobLeadsFilters';
import { JobLeadCardSkeleton } from '../components/JobLeadCard';
import { useToastContext } from '../contexts/ToastContext';
import Pagination from '../components/Pagination';

// Table row skeleton component for desktop loading
function TableRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <tr key={index} className={index < count - 1 ? 'border-b border-tertiary' : ''}>
          <td className="py-3 px-4">
            <div className="h-4 bg-bg2 rounded w-32 animate-pulse" />
          </td>
          <td className="py-3 px-4">
            <div className="h-4 bg-bg2 rounded w-40 animate-pulse" />
          </td>
          <td className="py-3 px-4">
            <div className="h-6 w-20 bg-bg2 rounded animate-pulse" />
          </td>
          <td className="py-3 px-4">
            <div className="h-4 bg-bg2 rounded w-20 animate-pulse" />
          </td>
          <td className="py-3 px-4">
            <div className="h-4 bg-bg2 rounded w-24 animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}

// Debounce hook
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

// Status badge colors
function getStatusStyles(status: JobLeadStatus): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'extracted':
      return { bg: 'bg-green-bright/20', text: 'text-green-bright', dot: 'bg-green-bright' };
    case 'failed':
      return { bg: 'bg-red-bright/20', text: 'text-red-bright', dot: 'bg-red-bright' };
    case 'pending':
    default:
      return { bg: 'bg-yellow/20', text: 'text-yellow', dot: 'bg-yellow' };
  }
}

export default function JobLeads() {
  const toast = useToastContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobLeads, setJobLeads] = useState<JobLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [perPage, setPerPage] = useState(25);

  // Get filter values from URL
  const page = parseInt(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const sourceFilter = searchParams.get('source') || '';
  const sortFilter = searchParams.get('sort') || 'newest';

  // Debounce search input
  const debouncedSearch = useDebounce(search, 300);

  // Extract unique sources from job leads for the filter dropdown
  const sources = useMemo(() => {
    const uniqueSources = new Set<string>();
    jobLeads.forEach((lead) => {
      if (lead.source) {
        uniqueSources.add(lead.source);
      }
    });
    return Array.from(uniqueSources).sort();
  }, [jobLeads]);

  const isFiltered = search || statusFilter || sourceFilter;

  // Load job leads when filters change
  useEffect(() => {
    loadJobLeads();
  }, [page, debouncedSearch, statusFilter, sourceFilter, sortFilter, perPage]);

  async function loadJobLeads() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (statusFilter) params.status = statusFilter;
      // Note: search, source, and sort are not yet implemented in the backend
      // but we send them anyway for forward compatibility
      if (debouncedSearch) params.search = debouncedSearch;
      if (sourceFilter) params.source = sourceFilter;
      if (sortFilter) params.sort = sortFilter;

      const data = await getJobLeads(params);
      setJobLeads(data.items);
      setTotal(data.total);
    } catch {
      toast.error('Failed to load job leads');
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
    // Reset to page 1 when filters change
    if (
      updates.search !== undefined ||
      updates.status !== undefined ||
      updates.source !== undefined ||
      updates.sort !== undefined
    ) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  }

  const handleFiltersChange = useCallback(
    (filters: JobLeadsFiltersValue) => {
      updateParams({
        status: filters.status,
        source: filters.source,
        sort: filters.sort,
      });
      if (filters.perPage !== perPage) {
        setPerPage(filters.perPage);
        updateParams({ page: '1' });
      }
    },
    [searchParams, perPage]
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <h1 className="text-2xl font-bold text-primary mb-6">Job Leads</h1>

        {/* Filters Section */}
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

        {/* Loading State */}
        {loading ? (
          <>
            {/* Desktop Table Skeleton */}
            <div className="hidden md:block bg-secondary rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-tertiary">
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Company
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Position
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Source
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableRowSkeleton count={5} />
                </tbody>
              </table>
            </div>

            {/* Mobile Cards Skeleton */}
            <div className="md:hidden space-y-3">
              <JobLeadCardSkeleton count={5} />
            </div>
          </>
        ) : jobLeads.length === 0 ? (
          /* Empty States */
          isFiltered ? (
            <EmptyState
              message="No job leads match your search or filters."
              subMessage="Try different keywords or clear filters."
              icon="bi-search"
            />
          ) : (
            <EmptyState
              message="No job leads yet. Add URLs to start tracking job opportunities."
              subMessage="Job leads are automatically created when you add URLs."
              icon="bi-bookmark-star"
            />
          )
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-secondary rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-tertiary">
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Company
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Position
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Source
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobLeads.map((lead, index) => {
                    const statusStyles = getStatusStyles(lead.status);
                    return (
                      <tr
                        key={lead.id}
                        className={`transition-all duration-200 ease-in-out ${
                          index < jobLeads.length - 1 ? 'border-b border-tertiary' : ''
                        }`}
                      >
                        <td className="py-3 px-4 text-sm">
                          <Link
                            to={`/job-leads/${lead.id}`}
                            className="text-fg1 hover:text-accent-bright transition-all duration-200 ease-in-out font-medium cursor-pointer"
                          >
                            {lead.company || truncate(lead.url, 40)}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-sm text-primary">
                          {lead.title || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${statusStyles.bg} ${statusStyles.text}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${statusStyles.dot}`} />
                            {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-secondary">
                          {lead.source || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-secondary">
                          {formatDate(lead.scraped_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {jobLeads.map((lead) => {
                const statusStyles = getStatusStyles(lead.status);
                return (
                  <Link
                    key={lead.id}
                    to={`/job-leads/${lead.id}`}
                    className="block bg-secondary rounded-lg p-4 hover:bg-bg2 transition-all duration-200 ease-in-out cursor-pointer"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-fg1 font-medium truncate">
                        {lead.company || truncate(lead.url, 30)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold flex-shrink-0 ${statusStyles.bg} ${statusStyles.text}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${statusStyles.dot}`} />
                        {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                      </span>
                    </div>
                    <div className="text-sm text-primary truncate mb-2">
                      {lead.title || 'No title'}
                    </div>
                    <div className="text-xs text-secondary">
                      {formatDate(lead.scraped_at)}
                      {lead.source && ` · ${lead.source}`}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="mt-6">
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(total / perPage)}
                perPage={perPage}
                totalItems={total}
                onPageChange={(newPage) => updateParams({ page: String(newPage) })}
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
