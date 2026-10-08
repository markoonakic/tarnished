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
      className="bg-secondary mb-6 rounded-lg p-4"
      aria-label={t('tasks.pipeline')}
    >
      {query.isError && (
        <p role="alert">
          {t('tasks.loadFailed')}{' '}
          <button className="underline" onClick={() => void query.refetch()}>
            {t('Retry')}
          </button>
        </p>
      )}
      <div className="mb-3 flex h-2 overflow-hidden rounded-full">
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
            className="focus:ring-accent rounded text-xs focus:ring-2"
            style={{ color: getStatusColor(s.name, colors, s.color) }}
          >
            {statusLabel(s)}{' '}
            <span className="text-primary font-semibold">{s.count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
