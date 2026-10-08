import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardOverview } from '@/hooks/useDashboardOverview';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { getEffectiveTimeZone } from '@/lib/roundDateTime';
import { locale } from '@/lib/i18n';
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
  const date = (value: string) =>
    new Date(value).toLocaleString(locale(), {
      timeZone: zone ?? undefined,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card
        title={t('tasks.upcomingInterviews')}
        icon="bi-calendar-event"
        count={query.data?.upcoming_interviews.length}
        className="mb-0"
      >
        <div className="space-y-3">
          {query.data?.upcoming_interviews.map((r) => (
            <Link
              key={r.id}
              to={`/interviews/${r.id}`}
              className="bg-bg2 hover:bg-bg3 focus:ring-accent block rounded-lg p-3 text-sm focus:ring-2"
            >
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
            </Link>
          ))}
        </div>
        {!query.data?.upcoming_interviews.length && (
          <p className="text-muted text-sm">{t('kit.noInterviews')}</p>
        )}
        <Link
          to="/tasks?view=interviews"
          className="text-accent mt-4 block text-xs"
        >
          {t('tasks.openCalendar')} →
        </Link>
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
        <div className="space-y-3">
          {query.data?.tasks.slice(0, 5).map((r) => (
            <div
              key={r.id}
              className="bg-bg2 flex items-start gap-3 rounded-lg p-3"
            >
              <button
                aria-label={t('kit.completeReminder', { title: r.title })}
                onClick={() => void actions.toggle(r)}
                className="border-bg4 hover:border-accent focus:ring-accent mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 focus:ring-2"
              />
              <Link to="/tasks" className="min-w-0 text-sm">
                <span className="text-primary block">{r.title}</span>
                <span
                  className={`text-xs ${new Date(r.due_at) < new Date() ? 'text-red-bright' : 'text-muted'}`}
                >
                  {new Date(r.due_at) < new Date() &&
                    `${t('tasks.overdue')} · `}
                  {zone
                    ? dueText(r.due_at, zone, new Date(), true)
                    : date(r.due_at)}
                </span>
              </Link>
            </div>
          ))}
          {query.data?.deadlines
            .slice(0, Math.max(0, 5 - query.data.tasks.length))
            .map((d) => (
              <Link
                key={d.id}
                to="/tasks"
                className="bg-bg2 text-muted block rounded-lg p-3 text-sm"
              >
                {t('tasks.deadline', { title: d.title })}
                <span className="block text-xs">{date(d.due_at)}</span>
              </Link>
            ))}
        </div>
        {!query.data?.tasks.length && !query.data?.deadlines.length && (
          <p className="text-muted text-sm">{t('kit.noTasks')}</p>
        )}
        <Link to="/tasks" className="text-accent mt-4 block text-xs">
          {t('tasks.openTasks')} →
        </Link>
      </Card>
      <Card
        title={t('tasks.recentlyUpdated')}
        icon="bi-clock-history"
        count={query.data?.recent_applications.length}
        className="mb-0"
      >
        <div className="space-y-3">
          {query.data?.recent_applications.map((a) => (
            <Link
              key={a.id}
              to={`/applications/${a.id}`}
              className="bg-bg2 hover:bg-bg3 focus:ring-accent block rounded-lg p-3 text-sm focus:ring-2"
            >
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
            </Link>
          ))}
        </div>
        {!query.data?.recent_applications.length && (
          <p className="text-muted text-sm">{t('tasks.noRecent')}</p>
        )}
        <Link to="/applications" className="text-accent mt-4 block text-xs">
          {t('tasks.viewApplications')} →
        </Link>
      </Card>
      {query.isError && (
        <p role="alert" className="text-red-bright lg:col-span-3">
          {t('tasks.loadFailed')}{' '}
          <button className="underline" onClick={() => void query.refetch()}>
            {t('Retry')}
          </button>
        </p>
      )}
    </div>
  );
}
