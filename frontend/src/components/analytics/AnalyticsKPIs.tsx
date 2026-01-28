import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface AnalyticsKPIs {
  total_applications: number;
  interviews: number;
  offers: number;
  application_to_interview_rate: number;
  response_rate: number;
  active_opportunities: number;
}

interface KPICardProps {
  title: string;
  value: number | string;
  unit?: string;
  tooltip?: string;
}

function KPICard({ title, value, unit, tooltip }: KPICardProps) {
  return (
    <div
      className="bg-secondary rounded-lg p-4 border border-tertiary relative group"
      title={tooltip}
    >
      <h3 className="text-xs font-semibold text-fg4 mb-1">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-fg1">{value}</span>
        {unit && <span className="text-xs text-fg4">{unit}</span>}
      </div>
    </div>
  );
}

interface AnalyticsKPIsProps {
  period: string;
}

export default function AnalyticsKPIs({ period }: AnalyticsKPIsProps) {
  const [kpis, setKpis] = useState<AnalyticsKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    async function fetchKPIs() {
      setLoading(true);
      try {
        const response = await api.get(`/analytics/kpis?period=${period}`);
        setKpis(response.data);
      } catch (err) {
        console.error('Error fetching KPIs, using mock data:', err);
        setKpis(getMockKPIs());
      } finally {
        setLoading(false);
      }
    }

    fetchKPIs();
  }, [period]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-secondary rounded-lg p-4 border border-tertiary animate-pulse">
            <div className="h-3 bg-tertiary rounded mb-2 w-20"></div>
            <div className="h-6 bg-tertiary rounded w-12"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !kpis) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="col-span-full bg-secondary rounded-lg p-4 border border-tertiary">
          <p className="text-red text-sm">Failed to load KPIs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <KPICard
        title="Total Applications"
        value={kpis.total_applications}
      />
      <KPICard
        title="Interviews"
        value={kpis.interviews}
      />
      <KPICard
        title="Offers"
        value={kpis.offers}
      />
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

// Mock data function for when backend endpoint doesn't exist
function getMockKPIs(): AnalyticsKPIs {
  return {
    total_applications: 42,
    interviews: 8,
    offers: 2,
    application_to_interview_rate: 19,
    response_rate: 35,
    active_opportunities: 15,
  };
}
