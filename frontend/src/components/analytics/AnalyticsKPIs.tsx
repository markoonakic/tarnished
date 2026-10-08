import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useAnalyticsKPIs } from '@/hooks/useAnalyticsData';
import StageResidence from './StageResidence';
import HelpTip from '../HelpTip';

interface KPICardProps {
  title: string;
  value: number | string;
  unit?: string;
  tooltip?: string;
}

function KPICard({ title, value, unit, tooltip }: KPICardProps) {
  useTranslation();
  return (
    <div className="bg-secondary group relative rounded-lg p-4" title={tooltip}>
      <h3 className="text-fg4 mb-1 text-xs! font-semibold">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-fg1 text-xl font-bold">{value}</span>
        {unit && <span className="text-fg4 text-xs">{unit}</span>}
      </div>
    </div>
  );
}

interface AnalyticsKPIsProps {
  period: string;
  asOf?: string;
}

export default function AnalyticsKPIs({ period, asOf }: AnalyticsKPIsProps) {
  useTranslation();
  const { data: kpis, isLoading, isError } = useAnalyticsKPIs(period, asOf);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-secondary animate-pulse rounded-lg p-4">
            <div className="bg-tertiary mb-2 h-3 w-20 rounded"></div>
            <div className="bg-tertiary h-6 w-12 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !kpis) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="bg-secondary col-span-full rounded-lg p-4">
          <p className="text-red-bright text-sm">{t('Failed to load KPIs')}</p>
        </div>
      </div>
    );
  }

  const rate = (value: number | null) => (value === null ? '—' : `${value}%`);
  return (
    <>
      <h3 className="text-fg1 mb-3 flex items-center gap-2 font-medium">
        {t('Pipeline metrics')}
        <HelpTip label={t('About pipeline metrics')}>
          <p>
            {t('Applications sent')}{' '}
            {kpis.scope.cohort_start
              ? `${kpis.scope.cohort_start} – ${kpis.scope.cohort_end}`
              : t('at any time')}
            {t('. Rates use')} {kpis.total_applications}{' '}
            {t('applications; saved leads are excluded.')}
          </p>
        </HelpTip>
      </h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KPICard
          title={t('Total Applications')}
          value={kpis.total_applications}
        />
        <KPICard
          title={t('Interviews')}
          value={kpis.interviews}
          tooltip="Applications with a recorded interview stage, including those that have since moved on."
        />
        <KPICard
          title={t('Offers')}
          value={kpis.offers}
          tooltip="Applications with a recorded offer stage, including those that have since moved on."
        />
        <KPICard
          title={t('App to Interview Rate')}
          value={rate(kpis.interview_rate)}
          tooltip={t(
            '{{interviews}} of {{total_applications}} applications reached an interview.',
            {
              interviews: kpis.interviews,
              total_applications: kpis.total_applications,
            }
          )}
        />
        <KPICard
          title={t('Response Rate')}
          value={rate(kpis.response_rate)}
          tooltip={t(
            '{{responded}} of {{total_applications}} applications have a recorded employer reply. {{response_unknown}} have unknown response history.',
            {
              responded: kpis.responded,
              total_applications: kpis.total_applications,
              response_unknown: kpis.response_unknown,
            }
          )}
        />
        <KPICard
          title={t('Active Opportunities')}
          value={kpis.active_opportunities}
          tooltip="Applications currently in progress."
        />
      </div>
      <StageResidence metrics={kpis} />
    </>
  );
}
