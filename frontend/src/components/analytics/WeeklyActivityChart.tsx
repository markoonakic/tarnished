import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

import { useWeeklyActivityData } from '@/hooks/useAnalyticsData';
import { useThemeColors } from '@/hooks/useThemeColors';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';
import HelpTip from '@/components/HelpTip';

interface WeeklyActivityChartProps {
  period: string;
  asOf?: string;
}

export default function WeeklyActivityChart({
  period,
  asOf,
}: WeeklyActivityChartProps) {
  const { t } = useTranslation();
  const { data = [], isLoading, isError } = useWeeklyActivityData(period, asOf);
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
        top: '20%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: sortedData.map((d) =>
          t('Week {{week}}', { week: d.week.match(/\d+/)?.[0] ?? d.week })
        ),
        axisLabel: { color: colors.fg4 },
        axisLine: { lineStyle: { color: colors.bg2 } },
        axisTick: { lineStyle: { color: colors.bg2 } },
      },
      yAxis: {
        type: 'value',
        name: t('Count'),
        nameTextStyle: { color: colors.fg4 },
        axisLabel: { color: colors.fg4 },
        axisLine: { lineStyle: { color: colors.bg2 } },
        axisTick: { lineStyle: { color: colors.bg2 } },
        splitLine: { lineStyle: { color: colors.bg2, type: 'dashed' } },
      },
      legend: { type: 'scroll', top: 0, textStyle: { color: colors.fg4 } },
      series: [
        {
          name: t('Rounds scheduled'),
          type: 'bar',
          data: sortedData.map((d) => d.rounds_scheduled),
          itemStyle: { color: colors.aqua },
        },
        {
          name: t('Rounds completed'),
          type: 'bar',
          data: sortedData.map((d) => d.rounds_completed),
          itemStyle: { color: colors.green },
        },
        {
          name: t('Applications'),
          type: 'bar',
          data: sortedData.map((d) => d.applications),
          itemStyle: { color: colors.blue },
          emphasis: {
            itemStyle: { color: colors.blueBright },
            focus: 'series',
          },
        },
        {
          name: t('Interviewing transitions'),
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
  }, [data, colors, t]);

  if (isLoading) {
    return <Loading message={t('Loading chart data...')} size="sm" />;
  }

  if (isError) {
    return (
      <div className="text-red-bright py-8 text-center">
        {t('Failed to load chart data')}
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState message={t('No data available for this period')} />;
  }

  return (
    <div className="w-full">
      <p className="text-muted mb-3 flex items-center gap-2 text-sm">
        {t('Weekly activity')}
        <HelpTip label={t('About weekly activity')}>
          <p>
            {t(
              'Applications and interview activity by week. Week 1 is the most recent week.'
            )}
          </p>
        </HelpTip>
      </p>
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '16rem' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
