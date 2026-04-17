import { useDashboardKPIs } from '@/hooks/useDashboardData';

interface KPICardProps {
  title: string;
  value: number;
  trend?: number | null;
  suffix?: string;
}

function getTrendDisplay(value: number, trend?: number | null) {
  if (trend === undefined) {
    return null;
  }

  if (trend === null) {
    return value > 0 ? { text: 'New', className: 'text-green' } : null;
  }

  if (trend > 0) {
    return {
      text: `↑ ${Math.abs(trend)}%`,
      className: 'text-green',
    };
  }

  if (trend < 0) {
    return {
      text: `↓ ${Math.abs(trend)}%`,
      className: 'text-red-bright',
    };
  }

  return {
    text: '0%',
    className: 'text-fg4',
  };
}

function KPICard({ title, value, trend, suffix = '' }: KPICardProps) {
  const trendDisplay = getTrendDisplay(value, trend);

  return (
    <div className="bg-secondary rounded-lg p-6">
      <h3 className="text-fg4 mb-2 text-sm font-semibold">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-fg1 text-2xl font-bold">{value}</span>
        {suffix && <span className="text-fg4 text-sm">{suffix}</span>}
      </div>
      {trendDisplay && (
        <p className={`mt-2 text-xs ${trendDisplay.className}`}>
          {trendDisplay.text}
        </p>
      )}
    </div>
  );
}

export default function KPICards() {
  const { data: kpis, isLoading, isError } = useDashboardKPIs();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-secondary animate-pulse rounded-lg p-6">
            <div className="bg-tertiary mb-2 h-4 w-24 rounded"></div>
            <div className="bg-tertiary h-8 w-16 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !kpis) {
    return (
      <div className="bg-secondary rounded-lg p-6">
        <p className="text-red-bright">Failed to load dashboard KPIs</p>
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
      <KPICard
        title="Last 7 Days"
        value={kpis.last_7_days}
        trend={kpis.last_7_days_trend}
        suffix="applications"
      />
      <KPICard
        title="Last 30 Days"
        value={kpis.last_30_days}
        trend={kpis.last_30_days_trend}
        suffix="applications"
      />
      <KPICard
        title="Active Opportunities"
        value={kpis.active_opportunities}
        suffix="open"
      />
    </div>
  );
}
