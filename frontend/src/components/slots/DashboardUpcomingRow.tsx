import TextLink from '@/components/ui/TextLink';
import RecordLink from '@/components/ui/RecordLink';
import Button from '@/components/ui/Button';
import { formatDateTime } from '@/lib/displayDate';

import { useTranslation } from 'react-i18next';
import { useDashboardOverview } from '@/hooks/useDashboardOverview';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { getEffectiveTimeZone } from '@/lib/roundDateTime';

import { dueText } from '@/lib/taskDates';
import { roundTypeLabel, statusLabel } from '@/lib/referenceLabels';
import { useReminderActions } from '@/hooks/useReminderActions';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getStatusColor } from '@/lib/statusColors';
import Card from '../Card';

export default function DashboardUpcomingRow() {
  const { t } = useTranslation();
  const query = useDashboardOverview();
  const preferences = useUserPreferences();
  const zone = preferences.data ? getEffectiveTimeZone(preferences.data) : null;
  const actions = useReminderActions();
  const colors = useThemeColors();
  const updatedText = (value: string) => {
    const hours = Math.max(
      0,
      Math.floor((new Date().getTime() - Date.parse(value)) / 3_600_000)
    );
    return t(hours >= 24 ? 'tasks.daysAgo' : 'tasks.hoursAgo', {
      count: hours >= 24 ? Math.floor(hours / 24) : hours,
    });
  };
  const date = (value: string) => formatDateTime(value, zone ?? undefined);
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card
        title={t('tasks.upcomingInterviews')}
        icon="bi-calendar-event"
        count={query.data?.upcoming_interviews.length}
        className="mb-0"
      >
        <div className="space-y-2">
          {query.data?.upcoming_interviews.map((r) => (
            <RecordLink key={r.id} to={`/interviews/${r.id}`}>
              <span className="text-orange-bright text-xs">
                {r.scheduled_at ? date(r.scheduled_at) : '—'}
              </span>
              <span className="text-primary block">{r.company}</span>
              <span className="text-muted text-xs">
                <i
                  className={`bi ${r.mode === 'video' ? 'bi-camera-video' : r.mode === 'phone' ? 'bi-telephone' : 'bi-geo-alt'} mr-1`}
                  aria-hidden="true"
                />
                {roundTypeLabel(r.round_type)}
              </span>
            </RecordLink>
          ))}
        </div>
        {!query.data?.upcoming_interviews.length && (
          <p className="text-muted text-sm">{t('kit.noInterviews')}</p>
        )}
        <TextLink to="/tasks?view=interviews" className="mt-4 block">
          {t('tasks.openCalendar')} →
        </TextLink>
      </Card>
      <Card
        title={t('tasks.tasksDeadlines')}
        icon="bi-check2-square"
        count={
          query.data
            ? Math.min(5, query.data.tasks.length + query.data.deadlines.length)
            : undefined
        }
        className="mb-0"
      >
        <div className="space-y-2">
          {query.data?.tasks.slice(0, 5).map((r) => (
            <div
              key={r.id}
              className="bg-tertiary flex items-start gap-3 rounded-lg p-4"
            >
              <Button
                variant="icon"
                aria-label={t('kit.completeReminder', { title: r.title })}
                onClick={() => void actions.toggle(r)}
                className="shrink-0"
              >
                <i className="bi-circle icon-sm" aria-hidden="true" />
              </Button>
              <TextLink to="/tasks" className="min-w-0">
                <span className="text-primary block">{r.title}</span>
                <span
                  className={`text-xs ${new Date(r.due_at) < new Date() ? 'text-red-bright' : 'text-muted'}`}
                >
                  {new Date(r.due_at) < new Date() &&
                    `${t('tasks.group.overdue')} · `}
                  {zone
                    ? dueText(r.due_at, zone, new Date(), true)
                    : date(r.due_at)}
                </span>
              </TextLink>
            </div>
          ))}
          {query.data?.deadlines
            .slice(0, Math.max(0, 5 - query.data.tasks.length))
            .map((d) => (
              <RecordLink key={d.id} to="/tasks">
                {t('tasks.deadline', { title: d.title })}
                <span className="block text-xs">{date(d.due_at)}</span>
              </RecordLink>
            ))}
        </div>
        {!query.data?.tasks.length && !query.data?.deadlines.length && (
          <p className="text-muted text-sm">{t('kit.noTasks')}</p>
        )}
        <TextLink to="/tasks" className="mt-4 block">
          {t('tasks.openTasks')} →
        </TextLink>
      </Card>
      <Card
        title={t('tasks.recentlyUpdated')}
        icon="bi-clock-history"
        count={query.data?.recent_applications.length}
        className="mb-0"
      >
        <div className="space-y-2">
          {query.data?.recent_applications.map((a) => (
            <RecordLink key={a.id} to={`/applications/${a.id}`}>
              <span className="text-primary block">{a.company}</span>
              <span className="text-muted block truncate text-xs">
                {a.job_title}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs"
                  style={{
                    color: getStatusColor(
                      a.status.name,
                      colors,
                      a.status.color
                    ),
                    backgroundColor: `${getStatusColor(a.status.name, colors, a.status.color)}20`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: getStatusColor(
                        a.status.name,
                        colors,
                        a.status.color
                      ),
                    }}
                  />
                  {statusLabel(a.status)}
                </span>
                <span className="text-muted text-xs">
                  {updatedText(a.updated_at)}
                </span>
              </div>
            </RecordLink>
          ))}
        </div>
        {!query.data?.recent_applications.length && (
          <p className="text-muted text-sm">{t('tasks.noRecent')}</p>
        )}
        <TextLink to="/applications" className="mt-4 block">
          {t('tasks.viewApplications')} →
        </TextLink>
      </Card>
      {query.isError && (
        <p role="alert" className="text-red-bright lg:col-span-3">
          {t('tasks.loadFailed')}{' '}
          <Button
            className="flex items-center gap-1.5"
            onClick={() => void query.refetch()}
          >
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {t('Retry')}
          </Button>
        </p>
      )}
    </div>
  );
}
