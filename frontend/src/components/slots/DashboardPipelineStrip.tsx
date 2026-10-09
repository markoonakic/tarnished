import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardOverview } from '@/hooks/useDashboardOverview';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getStatusColor } from '@/lib/statusColors';
import { statusLabel } from '@/lib/referenceLabels';
export default function DashboardPipelineStrip() {
  const { t } = useTranslation();
  const query = useDashboardOverview();
  const colors = useThemeColors();
  const pipeline = query.data?.pipeline ?? [];
  return (
    <section
      className="bg-secondary mb-6 rounded-lg p-6"
      aria-label={t('tasks.pipeline')}
    >
      {query.isError && (
        <p role="alert">
          {t('tasks.loadFailed')}{' '}
          <button
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
            onClick={() => void query.refetch()}
          >
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {t('Retry')}
          </button>
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-primary text-lg font-semibold">
          {t('tasks.pipeline')}
        </h2>
        <span className="text-muted text-xs">
          {t('tasks.pipelineTotal', {
            count: pipeline.reduce((total, status) => total + status.count, 0),
          })}
        </span>
      </div>
      <div className="mb-3 flex h-3 overflow-hidden rounded-full">
        {pipeline
          .filter((s) => s.count > 0)
          .map((s) => (
            <Link
              key={s.status_id}
              to={'/applications?status=' + s.status_id}
              style={{
                flex: s.count,
                backgroundColor: getStatusColor(s.name, colors, s.color),
              }}
              aria-label={statusLabel(s) + ' ' + s.count}
              className="focus:ring-accent focus:ring-2"
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {pipeline.map((s) => (
          <Link
            key={s.status_id}
            to={'/applications?status=' + s.status_id}
            className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
            style={{ color: getStatusColor(s.name, colors, s.color) }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: getStatusColor(s.name, colors, s.color),
              }}
            />
            {statusLabel(s)}{' '}
            <span className="text-primary font-semibold">{s.count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
