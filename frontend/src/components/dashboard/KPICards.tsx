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
  const trendColor = trend !== undefined ? (trend >= 0 ? 'text-green' : 'text-red') : '';
  const trendIcon = trend !== undefined ? (trend >= 0 ? '↑' : '↓') : '';
  const trendText = trend !== undefined ? `${trendIcon} ${Math.abs(trend)}%` : '';

  return (
    <div className="bg-secondary rounded-lg p-6 border border-tertiary">
      <h3 className="text-sm font-semibold text-fg4 mb-2">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-fg1">{value}</span>
        {suffix && <span className="text-sm text-fg4">{suffix}</span>}
      </div>
      {trend !== undefined && (
        <p className={`text-xs mt-2 ${trendColor}`}>{trendText}</p>
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
        const response = await api.get('/dashboard/kpis');
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-secondary rounded-lg p-6 border border-tertiary animate-pulse">
            <div className="h-4 bg-tertiary rounded mb-2 w-24"></div>
            <div className="h-8 bg-tertiary rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !kpis) {
    return (
      <div className="bg-secondary rounded-lg p-6 border border-tertiary mb-8">
        <p className="text-red">Failed to load dashboard KPIs</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
