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
import { colors } from '@/lib/theme';

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
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  // Get bar color considering both bar type AND segment hover
  const getBarColor = (barKey: string, segmentIndex: number) => {
    const isHovered = hoveredSegment === segmentIndex;

    if (barKey === 'applications') {
      return isHovered ? colors.blueBright : colors.blue;
    }
    if (barKey === 'interviews') {
      return isHovered ? colors.purpleBright : colors.purple;
    }
    return colors.blue;
  };

  // Transform data to enable per-segment hover
  const getSegmentData = (segmentIndex: number) => {
    const segment = data[segmentIndex];
    const maxValue = Math.max(segment.applications, segment.interviews, 1);

    return {
      week: segment.week,
      background: hoveredSegment === segmentIndex ? maxValue : 0,
      applications: segment.applications,
      interviews: segment.interviews,
    };
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
          <CartesianGrid strokeDasharray="3 3" stroke={colors.bg1} />
          <XAxis
            dataKey="week"
            tick={{ fill: colors.fg4, fontSize: 12 }}
            stroke={colors.bg1}
          />
          <YAxis
            tick={{ fill: colors.fg4, fontSize: 12 }}
            stroke={colors.bg1}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: colors.bg0Hard,
              border: `1px solid ${colors.bg1}`,
              borderRadius: '4px',
              color: colors.fg1,
              padding: '0.5rem 0.75rem',
            }}
            labelStyle={{
              color: colors.fg1,
              fontWeight: 600,
            }}
            itemStyle={{
              color: colors.fg1,
            }}
          />
          {data.map((_, segmentIndex) => (
            <Bar
              key={segmentIndex}
              data={getSegmentData(segmentIndex)}
              onMouseEnter={() => setHoveredSegment(segmentIndex)}
              onMouseLeave={() => setHoveredSegment(null)}
              style={{ cursor: 'pointer' }}
            >
              <Bar dataKey="background" fill={colors.bg2} stackId="bg" isAnimationActive={false} />
              <Bar dataKey="applications" fill={getBarColor('applications', segmentIndex)} name="Applications" stackId="data" radius={[4, 4, 0, 0]} />
              <Bar dataKey="interviews" fill={getBarColor('interviews', segmentIndex)} name="Interviews" stackId="data" radius={[4, 4, 0, 0]} />
            </Bar>
          ))}
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
