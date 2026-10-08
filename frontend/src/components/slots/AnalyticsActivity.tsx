import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Card from '@/components/Card';
import { apiV030, type Activity } from '@/lib/apiV030';
import { locale } from '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';
import { useEffectiveDayKey } from '@/hooks/useEffectiveDayKey';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import {
  analyticsQuery,
  type AnalyticsSlotProps,
} from '@/hooks/useAnalyticsBreakdowns';

const events: Record<string, string> = {
  'status.changed': 'analytics.statusChanged',
  'round.scheduled': 'analytics.interviewScheduled',
  'round.completed': 'analytics.interviewCompleted',
  'workspace.application.created': 'analytics.applicationAdded',
  'workspace.application.updated': 'analytics.applicationUpdated',
  'workspace.application.source': 'analytics.postingUpdated',
  'workspace.application.contacts': 'analytics.contactsUpdated',
  'workspace.lead.created': 'analytics.leadAdded',
  'workspace.lead.updated': 'analytics.leadUpdated',
  'workspace.lead.source': 'analytics.postingUpdated',
  'workspace.round.created': 'analytics.interviewAdded',
  'workspace.round.updated': 'analytics.interviewUpdated',
  'workspace.round.contacts': 'analytics.contactsUpdated',
  'workspace.company.created': 'analytics.companyAdded',
  'workspace.company.updated': 'analytics.companyUpdated',
  'workspace.company.deleted': 'analytics.companyDeleted',
  'workspace.contact.created': 'analytics.contactAdded',
  'workspace.contact.updated': 'analytics.contactUpdated',
  'workspace.contact.deleted': 'analytics.contactDeleted',
  'workspace.note.created': 'analytics.noteAdded',
  'workspace.note.updated': 'analytics.noteUpdated',
  'workspace.note.deleted': 'analytics.noteDeleted',
  'workspace.reminder.created': 'analytics.reminderAdded',
  'workspace.reminder.updated': 'analytics.reminderUpdated',
  'workspace.reminder.deleted': 'analytics.reminderDeleted',
  'workspace.document.created': 'analytics.documentAdded',
  'workspace.document.deleted': 'analytics.documentDeleted',
};

function activityHref(item: Activity): string | undefined {
  if (
    /workspace\.(company|contact|lead|application|round)\.deleted$/.test(
      item.event
    )
  )
    return;
  if (item.round_id) return `/interviews/${item.round_id}`;
  if (item.application_id) return `/applications/${item.application_id}`;
  const routes: Record<string, string> = {
    application: 'applications',
    round: 'interviews',
    lead: 'job-leads',
    company: 'companies',
    contact: 'contacts',
  };
  if (item.target_id && routes[item.target_type])
    return `/${routes[item.target_type]}/${item.target_id}`;
  if (item.target_type === 'reminders') return '/tasks';
}

export default function AnalyticsActivity(props: AnalyticsSlotProps) {
  const { t } = useTranslation();
  const dayKey = useEffectiveDayKey();
  const { data: preferences } = useUserPreferences();
  const query = analyticsQuery(props);
  const history = useInfiniteQuery(
    {
      queryKey: ['analytics-history', query.period, dayKey, query.as_of],
      initialPageParam: { page: 1, asOf: query.as_of },
      queryFn: async ({ pageParam }) => {
        const asOf = pageParam.asOf ?? new Date().toISOString();
        return {
          ...(await apiV030.activity({
            ...query,
            as_of: asOf,
            page: pageParam.page,
            per_page: 25,
          })),
          asOf,
        };
      },
      getNextPageParam: (last) =>
        last.page * last.per_page < last.total
          ? { page: last.page + 1, asOf: last.asOf }
          : undefined,
    },
    queryClient
  );
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const timeZone =
    preferences?.time_zone_mode === 'manual'
      ? preferences.time_zone || undefined
      : undefined;
  return (
    <Card title={t('analytics.activity')} icon="bi-activity" className="mb-0!">
      <p className="text-muted mb-3 text-xs">{t('analytics.activityHint')}</p>
      {history.isPending && (
        <p className="text-muted" role="status">
          {t('analytics.loading')}
        </p>
      )}
      {!history.isPending && !history.isError && items.length === 0 && (
        <p className="text-muted text-sm">{t('analytics.noActivity')}</p>
      )}
      {items.length > 0 && (
        <ul>
          {items.map((item) => {
            const href = activityHref(item);
            const label = t(events[item.event] ?? 'analytics.recordUpdated');
            return (
              <li
                key={`${item.id}:${item.event}`}
                className="border-muted/30 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b py-3 text-sm sm:grid-cols-[9rem_1fr_auto]"
              >
                <time
                  dateTime={item.occurred_at}
                  title={new Date(item.occurred_at).toLocaleString(locale(), {
                    timeZone,
                  })}
                  className="text-muted col-span-2 text-xs sm:col-span-1"
                >
                  {new Date(item.occurred_at).toLocaleString(locale(), {
                    timeZone,
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </time>
                <span className="text-fg1 flex min-w-0 items-center gap-3">
                  <i
                    className="bi bi-clock-history text-accent"
                    aria-hidden="true"
                  />
                  <span>
                    <span>{label}</span>
                    {item.target_label && <> · {item.target_label}</>}
                  </span>
                </span>
                {href && (
                  <Link
                    to={href}
                    className="text-accent rounded text-xs"
                    aria-label={t('analytics.openEvent', { event: label })}
                  >
                    {t('analytics.open')}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {history.isError && (
        <div className="mt-3" role="alert">
          <p className="text-red-bright text-sm">
            {t('analytics.activityError')}
          </p>
          <button
            type="button"
            className="text-accent mt-2 rounded"
            onClick={() =>
              void (history.isFetchNextPageError
                ? history.fetchNextPage()
                : history.refetch())
            }
          >
            {t('analytics.retry')}
          </button>
        </div>
      )}
      {history.hasNextPage && !history.isFetchNextPageError && (
        <button
          type="button"
          className="text-accent mt-4 rounded disabled:opacity-50"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {t(
            history.isFetchingNextPage
              ? 'analytics.loading'
              : 'analytics.loadMore'
          )}
        </button>
      )}
    </Card>
  );
}
