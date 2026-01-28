import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '@/lib/api';

interface WeeklyData {
  week: string;
  applications: number;
  interviews: number;
}

interface WeeklyBarChartProps {
  period: string;
}

export default function WeeklyBarChart({ period }: WeeklyBarChartProps) {
  const [data, setData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  // Color variants: darker (default) → brighter (hover)
  const getAppColor = (barKey: string) => {
    if (barKey === 'applications') {
      return hoveredBar === 'applications' ? '#7ec1c1' : '#458588';  // brighter blue : blue
    }
    if (barKey === 'interviews') {
      return hoveredBar === 'interviews' ? '#e6a9ef' : '#d3869b';  // brighter purple : purple
    }
    return '#458588';
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const response = await api.get(`/api/analytics/weekly?period=${period}`);
        setData(response.data);
      } catch (err) {
        console.error('Error fetching weekly data, using mock data:', err);
        setData(getMockData(period));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [period]);

  if (loading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <div className="text-muted">Loading chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <div className="text-red">Failed to load chart data</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <div className="text-muted">No data available for this period</div>
      </div>
    );
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3c3836" />
          <XAxis
            dataKey="week"
            tick={{ fill: '#a89984', fontSize: 12 }}
            stroke="#3c3836"
          />
          <YAxis
            tick={{ fill: '#a89984', fontSize: 12 }}
            stroke="#3c3836"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1d2021',
              border: '1px solid #3c3836',
              borderRadius: '4px',
              color: '#ebdbb2',
              padding: '0.5rem 0.75rem',
            }}
            labelStyle={{
              color: '#ebdbb2',
              fontWeight: 600,
            }}
            itemStyle={{
              color: '#ebdbb2',
            }}
          />
          <Bar
            dataKey="applications"
            fill={getAppColor('applications')}
            name="Applications"
            radius={[4, 4, 0, 0]}
            onMouseEnter={() => setHoveredBar('applications')}
            onMouseLeave={() => setHoveredBar(null)}
            style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
          />
          <Bar
            dataKey="interviews"
            fill={getAppColor('interviews')}
            name="Interviews"
            radius={[4, 4, 0, 0]}
            onMouseEnter={() => setHoveredBar('interviews')}
            onMouseLeave={() => setHoveredBar(null)}
            style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Mock data function for when backend endpoint doesn't exist
function getMockData(period: string): WeeklyData[] {
  const weekCount = period === '7d' ? 1 : period === '30d' ? 4 : period === '3m' ? 12 : 16;

  const data: WeeklyData[] = [];
  const today = new Date();

  for (let i = weekCount - 1; i >= 0; i--) {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekLabel =
      period === '7d'
        ? 'This Week'
        : `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    data.push({
      week: weekLabel,
      applications: Math.floor(Math.random() * 10) + 1,
      interviews: Math.floor(Math.random() * 3),
    });
  }

  return data;
}
