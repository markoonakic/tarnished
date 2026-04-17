import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import type { FunnelData } from '@/lib/analytics';
import { useInterviewRoundsAnalytics } from '@/hooks/useAnalyticsData';
import { useThemeColors } from '@/hooks/useThemeColors';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

const EMPTY_FUNNEL_DATA: FunnelData[] = [];

interface InterviewFunnelProps {
  period?: string;
  roundType?: string;
}

export default function InterviewFunnel({
  period = 'all',
  roundType,
}: InterviewFunnelProps) {
  const {
    data: analytics,
    isLoading,
    isError,
  } = useInterviewRoundsAnalytics(period, roundType);
  const data: FunnelData[] = analytics?.funnel_data ?? EMPTY_FUNNEL_DATA;
  const colors = useThemeColors();

  const option: EChartsOption = useMemo((): EChartsOption => {
    if (data.length === 0) return {};

    const tooltipFormatter = (
      params: CallbackDataParams | CallbackDataParams[]
    ): string => {
      // Handle both single and array params (array occurs with axis trigger)
      const p = Array.isArray(params) ? params[0] : params;
      const dataIndex = p.dataIndex as number;
      const item = data[dataIndex];
      if (!item) return '';
      return `${item.round}<br/>Count: ${item.count}<br/>Passed: ${item.passed}<br/>Conversion: ${item.conversion_rate}%`;
    };

    const labelFormatter = (
      params: CallbackDataParams | CallbackDataParams[]
    ): string => {
      // Handle both single and array params
      const p = Array.isArray(params) ? params[0] : params;
      const dataIndex = p.dataIndex as number;
      const item = data[dataIndex];
      if (!item) return `${p.name}: ${p.value}`;
      return `${item.round}: ${item.count}\n(${item.passed} passed - ${item.conversion_rate}%)`;
    };

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: colors.bg3,
        borderColor: colors.aquaBright,
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: colors.fg0 },
        formatter: tooltipFormatter,
      },
      series: [
        {
          type: 'funnel',
          left: '10%',
          width: '80%',
          label: {
            formatter: labelFormatter,
            color: colors.fg0,
            fontSize: 14,
            lineHeight: 18,
          },
          labelLine: {
            lineStyle: { color: colors.fg4 },
          },
          itemStyle: {
            borderColor: colors.aquaBright,
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          data: data.map((d, index) => {
            const funnelColors = [
              colors.aquaBright,
              colors.aqua,
              colors.blueBright,
              colors.blue,
              colors.greenBright,
              colors.green,
            ];
            const color = funnelColors[index % funnelColors.length];

            return {
              value: d.count,
              name: d.round,
              itemStyle: { color },
            };
          }),
        },
      ],
    };
  }, [data, colors]);

  if (isLoading) {
    return <Loading message="Loading interview funnel..." size="sm" />;
  }

  if (isError) {
    return (
      <div className="text-red-bright py-8 text-center">
        Failed to load interview funnel data
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        message="No interview data available"
        subMessage="Add interview rounds to your applications to see conversion funnel analytics"
        icon="bi-funnel"
      />
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <p className="text-fg4 mb-4 text-sm">
        Visualizes the conversion rate of candidates through each interview
        round stage. Each bar shows the count of interviews at that stage, with
        the percentage of candidates who advanced to the next round.
      </p>
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '31.25rem' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
