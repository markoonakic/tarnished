import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption, LabelLayoutOptionCallback } from 'echarts';
import type { OutcomeData } from '@/lib/analytics';
import { useInterviewRoundsAnalytics } from '@/hooks/useAnalyticsData';
import { useThemeColors } from '@/hooks/useThemeColors';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';
import HelpTip from '@/components/HelpTip';

const EMPTY_OUTCOME_DATA: OutcomeData[] = [];

const labelLayout: LabelLayoutOptionCallback = ({ rect, labelRect }) => ({
  hideOverlap: true,
  width: labelRect.width + 8 > rect.width ? 0 : undefined,
});

interface InterviewOutcomesProps {
  period?: string;
  roundType?: string;
  asOf?: string;
}

export default function InterviewOutcomes({
  period = 'all',
  roundType,
  asOf,
}: InterviewOutcomesProps) {
  const {
    data: analytics,
    isLoading,
    isError,
  } = useInterviewRoundsAnalytics(period, roundType, asOf);
  const data: OutcomeData[] = analytics?.outcome_data ?? EMPTY_OUTCOME_DATA;
  const colors = useThemeColors();

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    const totals = data.map(
      (d) => d.passed + d.failed + d.pending + d.withdrew
    );

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        renderMode: 'richText',
        formatter: (params) => {
          const entries = Array.isArray(params) ? params : [params];
          const total = entries.reduce(
            (sum, entry) => sum + Number(entry.value),
            0
          );
          return [
            entries[0]?.name,
            ...entries.map((entry) => {
              const count = Number(entry.value);
              const percent = total ? Math.round((count / total) * 100) : 0;
              return `${entry.seriesName}: ${count} (${percent}%)`;
            }),
          ].join('\n');
        },
        backgroundColor: colors.bg3,
        borderColor: colors.aquaBright,
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: colors.fg0 },
      },
      legend: {
        type: 'scroll',
        data: ['Passed', 'Failed', 'Pending', 'Withdrawn'],
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
      series: (
        [
          ['passed', 'Passed', colors.green],
          ['failed', 'Failed', colors.red],
          ['pending', 'Pending', colors.orange],
          ['withdrew', 'Withdrawn', colors.yellow],
        ] as const
      ).map(([key, name, color]) => ({
        name,
        type: 'bar' as const,
        labelLayout,
        stack: 'outcomes',
        itemStyle: { color },
        data: data.map((round, i) => ({
          value: round[key],
          label: {
            show: round[key] > 0,
            overflow: 'truncate' as const,
            ellipsis: '',
            position: 'inside' as const,
            color: colors.fg0,
            fontSize: 12,
            formatter: () => {
              const percent =
                totals[i] > 0 ? Math.round((round[key] / totals[i]) * 100) : 0;
              return `${round[key]} (${percent}%)`;
            },
          },
        })),
      })),
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
      <p className="text-fg4 mb-4 flex items-center gap-2 text-sm">
        Interview outcomes by round type
        <HelpTip label="About interview outcomes">
          <p>
            Each round type shows the number and percentage of passed, failed,
            pending and withdrawn rounds.
          </p>
        </HelpTip>
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
