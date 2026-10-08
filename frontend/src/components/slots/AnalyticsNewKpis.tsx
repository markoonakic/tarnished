import { useTranslation } from 'react-i18next';
import { locale } from '@/lib/i18n';
import {
  useAnalyticsBreakdowns,
  type AnalyticsSlotProps,
} from '@/hooks/useAnalyticsBreakdowns';

export default function AnalyticsNewKpis(props: AnalyticsSlotProps) {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useAnalyticsBreakdowns(props);
  if (isPending)
    return (
      <p className="text-muted mb-4" role="status">
        {t('analytics.loading')}
      </p>
    );
  if (isError || !data)
    return (
      <div className="bg-secondary mb-4 rounded-lg p-6" role="alert">
        <p className="text-red-bright">{t('analytics.loadError')}</p>
        <button
          type="button"
          className="text-accent mt-2 rounded"
          onClick={() => void refetch()}
        >
          {t('analytics.retry')}
        </button>
      </div>
    );
  const { first_response: response } = data;
  return (
    <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
      <section
        className="bg-secondary rounded-lg p-6"
        aria-label={t('analytics.firstResponse')}
      >
        <h3 className="text-muted mb-3 text-sm">
          {t('analytics.firstResponse')}
        </h3>
        <p className="text-fg1 text-2xl font-bold">
          {response.mean_days === null
            ? '—'
            : t('analytics.days', {
                count: response.mean_days,
                value: response.mean_days.toLocaleString(locale(), {
                  maximumFractionDigits: 1,
                }),
              })}
        </p>
        <p className="text-muted text-xs">
          {t('analytics.sample', {
            n: response.n,
            unknown: response.unknown_count,
          })}
        </p>
      </section>
      <section
        className="bg-secondary rounded-lg p-6"
        aria-label={t('analytics.rejected')}
      >
        <h3 className="text-muted mb-3 text-sm">{t('analytics.rejected')}</h3>
        <p className="text-fg1 text-2xl font-bold">
          {data.rejected_count.toLocaleString(locale())}
        </p>
        <p className="text-muted text-xs">{t('analytics.rejectedHint')}</p>
      </section>
    </div>
  );
}
