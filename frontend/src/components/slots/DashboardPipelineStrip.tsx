import Button from '@/components/ui/Button';
import TextLink from '@/components/ui/TextLink';

import HelpTip from '../HelpTip';
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
          <Button
            className="flex items-center gap-1.5"
            onClick={() => void query.refetch()}
          >
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {t('Retry')}
          </Button>
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-fg1 flex items-center gap-2 text-lg font-semibold">
          {t('tasks.pipeline')}
          <HelpTip label={t('tasks.pipeline')}>
            {t('tasks.pipelineTotal', {
              count: pipeline.reduce(
                (total, status) => total + status.count,
                0
              ),
            })}
          </HelpTip>
        </h2>
      </div>
      <div className="mb-3 flex h-3 overflow-hidden rounded-full">
        {pipeline
          .filter((s) => s.count > 0)
          .map((s) => (
            <TextLink
              key={s.status_id}
              to={'/applications?status=' + s.status_id}
              style={{ flex: s.count }}
              aria-label={statusLabel(s) + ' ' + s.count}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {pipeline.map((s) => (
          <TextLink
            key={s.status_id}
            to={'/applications?status=' + s.status_id}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: getStatusColor(s.name, colors, s.color),
              }}
            />
            {statusLabel(s)}{' '}
            <span className="text-primary font-semibold">{s.count}</span>
          </TextLink>
        ))}
      </div>
    </section>
  );
}
