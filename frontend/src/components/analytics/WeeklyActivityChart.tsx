import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

import { useWeeklyActivityData } from '@/hooks/useAnalyticsData';
import { useThemeColors } from '@/hooks/useThemeColors';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

interface WeeklyActivityChartProps {
  period: string;
}

export default function WeeklyActivityChart({
  period,
}: WeeklyActivityChartProps) {
  const { data = [], isLoading, isError } = useWeeklyActivityData(period);
  const colors = useThemeColors();

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    const sortedData = [...data].sort((a, b) => {
      const aMatch = a.week.match(/Week (\d+)/);
      const bMatch = b.week.match(/Week (\d+)/);
      if (aMatch && bMatch) {
        return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
      }
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
          itemStyle: { color: colors.orange },
          emphasis: {
            itemStyle: { color: colors.orangeBright },
            focus: 'series',
          },
        },
      ],
    };
  }, [data, colors]);

  if (isLoading) {
    return <Loading message="Loading chart data..." size="sm" />;
  }

  if (isError) {
    return (
      <div className="text-red-bright py-8 text-center">
        Failed to load chart data
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState message="No data available for this period" />;
  }

  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '16rem' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
