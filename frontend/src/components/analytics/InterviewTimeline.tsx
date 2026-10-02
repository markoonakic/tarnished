import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type {
  CallbackDataParams,
  TopLevelFormatterParams,
} from 'echarts/types/dist/shared';
import type { TimelineData } from '@/lib/analytics';
import { useInterviewRoundsAnalytics } from '@/hooks/useAnalyticsData';
import { useThemeColors } from '@/hooks/useThemeColors';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';
import HelpTip from '@/components/HelpTip';

const EMPTY_TIMELINE_DATA: TimelineData[] = [];

function formatDuration(days: number) {
  if (days > 0 && days < 1 / 24) {
    const minutes = days * 1440;
    return minutes < 1 ? '<1 min' : `${Math.round(minutes)} min`;
  }
  return days > 0 && days < 1
    ? `${(days * 24).toFixed(1)} h`
    : `${days.toFixed(1)} d`;
}

interface InterviewTimelineProps {
  period?: string;
  roundType?: string;
  asOf?: string;
}

export default function InterviewTimeline({
  period = 'all',
  roundType,
  asOf,
}: InterviewTimelineProps) {
  const {
    data: analytics,
    isLoading,
    isError,
  } = useInterviewRoundsAnalytics(period, roundType, asOf);
  const data: TimelineData[] = analytics?.timeline_data ?? EMPTY_TIMELINE_DATA;
  const colors = useThemeColors();

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    // Calculate max value for proper scaling
    const days = data.map((d) =>
      d.avg_hours != null ? d.avg_hours / 24 : d.avg_days
    );
    const maxValue = Math.max(...days);
    // Round the axis end up to a half day so labels stay readable.
    const xAxisMax = maxValue > 0 ? Math.ceil(maxValue * 1.2 * 2) / 2 : 1;

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: colors.bg3,
        borderColor: colors.aquaBright,
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: colors.fg0 },
        renderMode: 'richText',
        formatter: (params: TopLevelFormatterParams) => {
          const param = (params as CallbackDataParams[])[0];
          return `${param.name}: ${formatDuration(param.value as number)} elapsed scheduled-to-completed`;
        },
      },
      grid: {
        left: '3%',
        right: '8%',
        bottom: 65,
        top: '5%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'Scheduled-to-completed days',
        nameLocation: 'middle',
        nameTextStyle: {
          color: colors.fg4,
          fontSize: 12,
          padding: [0, 0, 0, 0],
        },
        nameGap: 35,
        max: xAxisMax,
        axisLabel: {
          color: colors.fg4,
          formatter: (value: number) => String(Number(value.toFixed(2))),
        },
        axisLine: { lineStyle: { color: colors.bg2 } },
        splitLine: {
          lineStyle: {
            color: colors.bg2,
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'category',
        data: data.map((d) => d.round),
        axisLabel: {
          color: colors.fg4,
          fontSize: 13,
        },
        axisLine: { lineStyle: { color: colors.bg2 } },
      },
      series: [
        {
          type: 'bar',
          data: days,
          itemStyle: {
            color: colors.aqua,
            borderRadius: [0, 4, 4, 0],
          },
          label: {
            show: true,
            position: 'right',
            formatter: (params: CallbackDataParams) => {
              const value = params.value as number;
              return formatDuration(value);
            },
            color: colors.fg1,
          },
          barWidth: '60%',
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)',
            },
          },
        },
      ],
    };
  }, [data, colors]);

  if (isLoading) {
    return <Loading message="Loading interview timeline..." size="sm" />;
  }

  if (isError) {
    return (
      <div className="text-red-bright py-8 text-center">
        Failed to load interview timeline data
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Description */}
      <p className="text-fg4 mb-4 flex items-center gap-2 text-sm">
        Interview duration
        <HelpTip label="About interview duration">
          <p>
            Average days from the scheduled interview to its recorded
            completion.
          </p>
        </HelpTip>
      </p>

      {/* Chart */}
      {data.length === 0 ? (
        <EmptyState
          message="No measured interview durations available"
          subMessage="Completed interview rounds with dates will appear here"
          icon="bi-clock-history"
        />
      ) : (
        <div className="w-full overflow-x-auto">
          <ReactECharts
            option={option}
            style={{ width: '100%', height: '31.25rem' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
      )}
    </div>
  );
}
