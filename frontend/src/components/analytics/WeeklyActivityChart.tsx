import { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import api from '@/lib/api';
import { colors } from '@/lib/theme';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

interface WeeklyData {
  week: string;
  applications: number;
  interviews: number;
}

interface WeeklyActivityChartProps {
  period: string;
}

export default function WeeklyActivityChart({ period }: WeeklyActivityChartProps) {
  const [data, setData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/analytics/weekly?period=${period}`);
        setData(response.data);
      } catch (err) {
        console.error('Error fetching weekly data:', err);
        setError('Failed to load chart data');
        setData(getMockData(period));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [period]);

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    // Ensure week ordering uses numerical sort (not alphabetical)
    // Backend already returns sorted data with week_num key, but we double-sort here
    const sortedData = [...data].sort((a, b) => {
      // Extract week number from labels like "Week 1", "Week 2", etc.
      const aMatch = a.week.match(/Week (\d+)/);
      const bMatch = b.week.match(/Week (\d+)/);
      if (aMatch && bMatch) {
        return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
      }
      // Fallback: if no week number, sort alphabetically
      return a.week.localeCompare(b.week);
    });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: colors.bg3,
        borderColor: colors.aquaBright,
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: colors.fg0 },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: sortedData.map((d) => d.week),
        axisLabel: { color: colors.fg4 },
        axisLine: { lineStyle: { color: colors.bg2 } },
        axisTick: { lineStyle: { color: colors.bg2 } },
      },
      yAxis: {
        type: 'value',
        name: 'Count',
        nameTextStyle: { color: colors.fg4 },
        axisLabel: { color: colors.fg4 },
        axisLine: { lineStyle: { color: colors.bg2 } },
        axisTick: { lineStyle: { color: colors.bg2 } },
        splitLine: { lineStyle: { color: colors.bg2, type: 'dashed' } },
      },
      series: [
        {
          name: 'Applications',
          type: 'bar',
          data: sortedData.map((d) => d.applications),
          itemStyle: { color: colors.blue },
          emphasis: {
            itemStyle: { color: colors.blueBright },
            focus: 'series',
          },
        },
        {
          name: 'Interviews',
          type: 'bar',
          data: sortedData.map((d) => d.interviews),
          itemStyle: { color: colors.orange }, // Using orange instead of invalid purple
          emphasis: {
            itemStyle: { color: colors.orangeBright },
            focus: 'series',
          },
        },
      ],
    };
  }, [data]);

  if (loading) {
    return <Loading message="Loading chart data..." size="sm" />;
  }

  if (error) {
    return <div className="text-center py-8 text-accent-red">{error}</div>;
  }

  if (data.length === 0) {
    return <EmptyState message="No data available for this period" />;
  }

  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '256px' }}
        opts={{ renderer: 'svg' }}
      />
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
        : `Week ${weekCount - i}`;

    data.push({
      week: weekLabel,
      applications: Math.floor(Math.random() * 10) + 1,
      interviews: Math.floor(Math.random() * 3),
    });
  }

  return data;
}
