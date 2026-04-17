import { useAnalyticsKPIs } from '@/hooks/useAnalyticsData';

interface KPICardProps {
  title: string;
  value: number | string;
  unit?: string;
  tooltip?: string;
}

function KPICard({ title, value, unit, tooltip }: KPICardProps) {
  return (
    <div className="bg-secondary group relative rounded-lg p-4" title={tooltip}>
      <h3 className="text-fg4 mb-1 text-xs font-semibold">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-fg1 text-xl font-bold">{value}</span>
        {unit && <span className="text-fg4 text-xs">{unit}</span>}
      </div>
    </div>
  );
}

interface AnalyticsKPIsProps {
  period: string;
}

export default function AnalyticsKPIs({ period }: AnalyticsKPIsProps) {
  const { data: kpis, isLoading, isError } = useAnalyticsKPIs(period);

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
          <p className="text-red-bright text-sm">Failed to load KPIs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <KPICard title="Total Applications" value={kpis.total_applications} />
      <KPICard title="Interviews" value={kpis.interviews} />
      <KPICard title="Offers" value={kpis.offers} />
      <KPICard
        title="App to Interview Rate"
        value={kpis.application_to_interview_rate}
        unit="%"
        tooltip="Percentage of applications that resulted in interviews"
      />
      <KPICard
        title="Response Rate"
        value={kpis.response_rate}
        unit="%"
        tooltip="Percentage of applications that received any response"
      />
      <KPICard
        title="Active Opportunities"
        value={kpis.active_opportunities}
        tooltip="Applications still in progress"
      />
    </div>
  );
}
