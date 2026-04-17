import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { OutcomeData } from '@/lib/analytics';
import { useInterviewRoundsAnalytics } from '@/hooks/useAnalyticsData';
import { useThemeColors } from '@/hooks/useThemeColors';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

const EMPTY_OUTCOME_DATA: OutcomeData[] = [];

interface InterviewOutcomesProps {
  period?: string;
  roundType?: string;
}

export default function InterviewOutcomes({
  period = 'all',
  roundType,
}: InterviewOutcomesProps) {
  const {
    data: analytics,
    isLoading,
    isError,
  } = useInterviewRoundsAnalytics(period, roundType);
  const data: OutcomeData[] = analytics?.outcome_data ?? EMPTY_OUTCOME_DATA;
  const colors = useThemeColors();

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    // Calculate total for each round type to get percentages
    const totals = data.map(
      (d) => d.passed + d.failed + d.pending + d.withdrew
    );

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
      legend: {
        data: ['Passed', 'Failed', 'Pending', 'Withdrew'],
        top: 0,
        right: 0,
        textStyle: { color: colors.fg1 },
      },
      grid: {
        left: '15%',
        right: '10%',
        bottom: '5%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLabel: { color: colors.fg4 },
        axisLine: { lineStyle: { color: colors.bg2 } },
        splitLine: { lineStyle: { color: colors.bg2 } },
      },
      yAxis: {
        type: 'category',
        data: data.map((d) => d.round),
        axisLabel: {
          color: colors.fg4,
          width: 120,
          overflow: 'truncate',
        },
        axisLine: { lineStyle: { color: colors.bg2 } },
      },
      series: [
        {
          name: 'Passed',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d, i) => ({
            value: d.passed,
            label: {
              show: d.passed > 0,
              position: 'inside',
              color: colors.fg0,
              fontSize: 12,
              formatter: () => {
                const pct =
                  totals[i] > 0 ? Math.round((d.passed / totals[i]) * 100) : 0;
                return `${d.passed} (${pct}%)`;
              },
            },
          })),
          itemStyle: { color: colors.green },
          label: {
            show: true,
            position: 'inside',
            color: colors.fg0,
            fontSize: 12,
          },
        },
        {
          name: 'Failed',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d, i) => ({
            value: d.failed,
            label: {
              show: d.failed > 0,
              position: 'inside',
              color: colors.fg0,
              fontSize: 12,
              formatter: () => {
                const pct =
                  totals[i] > 0 ? Math.round((d.failed / totals[i]) * 100) : 0;
                return `${d.failed} (${pct}%)`;
              },
            },
          })),
          itemStyle: { color: colors.red },
        },
        {
          name: 'Pending',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d, i) => ({
            value: d.pending,
            label: {
              show: d.pending > 0,
              position: 'inside',
              color: colors.fg0,
              fontSize: 12,
              formatter: () => {
                const pct =
                  totals[i] > 0 ? Math.round((d.pending / totals[i]) * 100) : 0;
                return `${d.pending} (${pct}%)`;
              },
            },
          })),
          itemStyle: { color: colors.orange },
        },
        {
          name: 'Withdrew',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d, i) => ({
            value: d.withdrew,
            label: {
              show: d.withdrew > 0,
              position: 'inside',
              color: colors.fg0,
              fontSize: 12,
              formatter: () => {
                const pct =
                  totals[i] > 0
                    ? Math.round((d.withdrew / totals[i]) * 100)
                    : 0;
                return `${d.withdrew} (${pct}%)`;
              },
            },
          })),
          itemStyle: { color: colors.yellow },
        },
      ],
    };
  }, [data, colors]);

  if (isLoading) {
    return <Loading message="Loading interview outcomes..." size="sm" />;
  }

  if (isError) {
    return (
      <div className="text-red-bright py-8 text-center">
        Failed to load interview outcomes data
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        message="No interview outcome data available"
        subMessage="Add completed interview rounds to see outcome analytics"
        icon="bi-bar-chart-steps"
      />
    );
  }

  return (
    <div className="w-full">
      <p className="text-fg4 mb-4 text-sm">
        Breakdown of interview outcomes by round type, showing the number and
        percentage of passed, failed, pending, and withdrawn rounds.
      </p>
      <div className="overflow-x-auto">
        <ReactECharts
          option={option}
          style={{ width: '100%', height: '31.25rem' }}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  );
}
