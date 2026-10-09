import Button from '@/components/ui/Button';
import TextLink from '@/components/ui/TextLink';
import { formatDate } from '@/lib/displayDate';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useRef } from 'react';
import { observeRead } from '../lib/queryClient';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getJobLeads,
  getJobLeadSources,
  type JobLeadListItem,
} from '../lib/jobLeads';

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
import MoreFilters from '../components/records/MoreFilters';
import {
  recordFilters,
  recordFilterKeys,
  changeRecordFilters,
} from '@/lib/recordFilters';

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
  useTranslation();
  const navigate = useNavigate();
  const { error: showError } = useToastContext();
  const requestId = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobLeads, setJobLeads] = useState<JobLeadListItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const perPage = [10, 25, 50, 100].includes(
    Number(searchParams.get('per_page'))
  )
    ? Number(searchParams.get('per_page'))
    : 25;

  const page = parsePositivePageParam(searchParams.get('page'));
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const decisionFilter = searchParams.get('decision') || '';
  const extraParams = new URLSearchParams(searchParams);
  extraParams.delete('search');
  const filterKey = extraParams.toString();
  const sourceFilter = searchParams.get('source') || '';
  const sortFilter = searchParams.get('sort') || 'newest';

  const debouncedSearch = useDebounce(search, 300);

  const isFiltered = recordFilterKeys.some((key) => searchParams.has(key));

  const loadJobLeads = useCallback(async () => {
    const ownedRequest = ++requestId.current;
    setLoading(true);
    setListError(false);
    try {
      const params = {
        ...recordFilters(new URLSearchParams(filterKey)),
        ...(statusFilter
          ? { status: statusFilter as JobLeadListItem['status'] }
          : {}),
        ...(decisionFilter
          ? {
              decision: decisionFilter as
                'interesting' | 'rejected' | 'archived' | 'undecided',
            }
          : {}),
        search: debouncedSearch || undefined,
        source: sourceFilter || undefined,
        sort: sortFilter as 'newest' | 'oldest',
        page,
        per_page: perPage,
      };

      const data = await getJobLeads(params);
      if (ownedRequest !== requestId.current) return;
      setJobLeads(data.items);
      setTotal(data.total);
    } catch (error) {
      if (ownedRequest !== requestId.current) return;
      setListError(true);
      showError(t('Failed to load job leads'));
      return { error };
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
    filterKey,
    decisionFilter,
  ]);

  const loadSources = useCallback(async () => {
    try {
      setSources(await getJobLeadSources());
    } catch (error) {
      setSources([]);
      return { error };
    }
  }, []);

  useEffect(() => {
    const stop = observeRead(loadJobLeads);
    return () => {
      stop();
      // Invalidate retries as well as the initial request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [loadJobLeads]);

  useEffect(() => observeRead(loadSources), [loadSources]);

  const updateParams = useCallback(
    (updates: Record<string, string | string[]>) => {
      setSearchParams(changeRecordFilters(searchParams, updates));
    },
    [searchParams, setSearchParams]
  );

  const handleFiltersChange = useCallback(
    (filters: JobLeadsFiltersValue) => {
      updateParams({
        status: filters.status,
        decision: filters.decision || '',
        source: filters.source,
        sort: filters.sort,
        per_page: String(filters.perPage),
      });
    },
    [updateParams]
  );

  function domain(url: string | null) {
    try {
      return url ? new URL(url).hostname : '';
    } catch {
      return '';
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-primary text-2xl font-bold">{t('Job Leads')}</h1>
          <JobLeadCaptureForm
            onSaved={async () => {
              await loadJobLeads();
            }}
          />
        </div>

        <div className="bg-bg1 mb-6 rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative w-full sm:min-w-0 sm:flex-1">
              <i className="bi-search icon-sm text-muted absolute top-1/2 left-3 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('Search company or job title...')}
                aria-label={t('Search job leads')}
                value={search}
                onChange={(e) => updateParams({ search: e.target.value })}
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded py-2 pr-9 pl-9 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
              {search && (
                <Button
                  variant="icon"
                  onClick={() => updateParams({ search: '' })}
                  className="absolute top-1/2 right-3"
                  aria-label={t('Clear search')}
                  title={t('Clear search')}
                >
                  <i className="bi-x icon-sm" />
                </Button>
              )}
            </div>

            <JobLeadsFilters
              value={{
                status: statusFilter,
                decision: decisionFilter,
                source: sourceFilter,
                sort: sortFilter,
                perPage: perPage,
              }}
              onChange={handleFiltersChange}
              sources={sources}
            />
            <MoreFilters
              params={searchParams}
              type="lead"
              onChange={updateParams}
            >
              <JobLeadsFilters
                advanced
                value={{
                  status: statusFilter,
                  decision: decisionFilter,
                  source: sourceFilter,
                  sort: sortFilter,
                  perPage,
                }}
                onChange={handleFiltersChange}
                sources={sources}
              />
            </MoreFilters>
          </div>
        </div>

        {loading ? (
          <Loading message={t('Loading job leads...')} />
        ) : listError ? (
          <div role="alert" className="text-red-bright">
            {t(
              'Could not refresh the list. This does not undo any saved lead.'
            )}
            <Button
              className="ml-3 flex items-center gap-1.5"
              onClick={loadJobLeads}
            >
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('Reload list')}
            </Button>
          </div>
        ) : jobLeads.length === 0 ? (
          isFiltered ? (
            <EmptyState
              message={t('No job leads match your search or filters.')}
              subMessage={t('Try different keywords or clear filters.')}
              icon="bi-search"
            />
          ) : (
            <EmptyState
              message={t(
                'No job leads yet. Add URLs to start tracking job opportunities.'
              )}
              subMessage={t('Save a link with New Job Lead to get started.')}
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
                      {t('Company')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('Position')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('records.decision')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('records.priority')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('records.deadline')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('Source')}
                    </th>
                    <th className="text-muted px-4 py-3 text-left text-xs font-bold tracking-wide uppercase">
                      {t('Added')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobLeads.map((lead, index) => {
                    const statusClass =
                      lead.decision === 'interesting'
                        ? 'bg-green/15 text-green'
                        : lead.decision === 'rejected'
                          ? 'bg-red/15 text-red'
                          : 'bg-bg2 text-muted';
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => navigate(`/job-leads/${lead.id}`)}
                        className={`hover:bg-bg2 cursor-pointer transition-all duration-200 ease-in-out ${
                          index < jobLeads.length - 1
                            ? 'border-tertiary border-b'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-sm">
                          <TextLink to={`/job-leads/${lead.id}`}>
                            <span className={lead.company ? '' : 'text-muted'}>
                              {lead.company || t('Untitled lead')}
                            </span>
                            {!lead.company && (
                              <span className="text-muted mt-1 block text-xs font-normal">
                                {domain(lead.url)}
                              </span>
                            )}
                          </TextLink>
                        </td>
                        <td className="text-primary px-4 py-3 text-sm">
                          {lead.title || <span className="text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                          >
                            <span className="h-2 w-2 rounded-full bg-current" />
                            {t(
                              'records.decision.' +
                                (lead.decision || 'undecided')
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={
                              lead.priority === 'high'
                                ? 'text-orange'
                                : 'text-muted'
                            }
                          >
                            {t('records.' + (lead.priority || 'normal'))}
                          </span>
                        </td>
                        <td className="text-secondary px-4 py-3 text-sm">
                          {formatDate(lead.deadline || null)}
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
                const statusClass =
                  lead.decision === 'interesting'
                    ? 'bg-green/15 text-green'
                    : lead.decision === 'rejected'
                      ? 'bg-red/15 text-red'
                      : 'bg-bg2 text-muted';
                return (
                  <TextLink
                    key={lead.id}
                    to={`/job-leads/${lead.id}`}
                    className="block"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span
                          className={`${lead.company ? 'text-fg1' : 'text-muted'} block truncate font-medium`}
                        >
                          {lead.company || t('Untitled lead')}
                        </span>
                        {!lead.company && (
                          <span className="text-muted mt-1 block truncate text-xs">
                            {domain(lead.url)}
                          </span>
                        )}
                      </div>
                      <span
                        className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                      >
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {t(
                          'records.decision.' + (lead.decision || 'undecided')
                        )}
                      </span>
                    </div>
                    <div className="text-primary mb-2 truncate text-sm">
                      {lead.title || <span className="text-muted">—</span>}
                    </div>
                    <div className="text-secondary text-xs">
                      <span
                        className={
                          lead.priority === 'high' ? 'text-orange mr-2' : 'mr-2'
                        }
                      >
                        {t('records.' + (lead.priority || 'normal'))}
                      </span>
                      {lead.deadline && (
                        <span className="mr-2">
                          {t('records.deadline')}: {formatDate(lead.deadline)}
                        </span>
                      )}
                      {formatDate(lead.scraped_at)}
                      {lead.source && ` · ${lead.source}`}
                    </div>
                  </TextLink>
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
