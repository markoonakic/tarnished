import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface DashboardKPIs {
  last_7_days: number;
  last_7_days_trend: number;
  last_30_days: number;
  last_30_days_trend: number;
  active_opportunities: number;
}

interface KPICardProps {
  title: string;
  value: number;
  trend?: number;
  suffix?: string;
}

function KPICard({ title, value, trend, suffix = '' }: KPICardProps) {
  const trendColor =
    trend !== undefined ? (trend >= 0 ? 'text-green' : 'text-red-bright') : '';
  const trendIcon = trend !== undefined ? (trend >= 0 ? '↑' : '↓') : '';
  const trendText =
    trend !== undefined ? `${trendIcon} ${Math.abs(trend)}%` : '';

  return (
    <div className="bg-secondary rounded-lg p-6">
      <h3 className="text-fg4 mb-2 text-sm font-semibold">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-fg1 text-2xl font-bold">{value}</span>
        {suffix && <span className="text-fg4 text-sm">{suffix}</span>}
      </div>
      {trend !== undefined && (
        <p className={`mt-2 text-xs ${trendColor}`}>{trendText}</p>
      )}
    </div>
  );
}

export default function KPICards() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchKPIs() {
      try {
        const response = await api.get('/api/dashboard/kpis');
        setKpis(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchKPIs();
  }, []);

  if (loading) {
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

  if (error || !kpis) {
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
