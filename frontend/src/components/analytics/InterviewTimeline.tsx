import { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type {
  CallbackDataParams,
  TopLevelFormatterParams,
} from 'echarts/types/dist/shared';
import { getInterviewRoundsData, type TimelineData } from '@/lib/analytics';
import { useThemeColors } from '@/hooks/useThemeColors';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

interface InterviewTimelineProps {
  period?: string;
  roundType?: string;
}

export default function InterviewTimeline({
  period = 'all',
  roundType,
}: InterviewTimelineProps) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const colors = useThemeColors();

  useEffect(() => {
    loadData();
  }, [period, roundType]);

  async function loadData() {
    try {
      setLoading(true);
      const result = await getInterviewRoundsData(period, roundType);
      setData(result.timeline_data);
      setError('');
    } catch {
      setError('Failed to load interview timeline data');
    } finally {
      setLoading(false);
    }
  }

  function getSpeedInfo(avgDays: number): { label: string; color: string } {
    if (avgDays <= 3) {
      return { label: 'Fast', color: colors.green };
    } else if (avgDays <= 7) {
      return { label: 'Normal', color: colors.aqua };
    } else {
      return { label: 'Slow', color: colors.orange };
    }
  }

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    // Calculate max value for proper scaling
    const maxValue = Math.max(...data.map((d) => d.avg_days));
    const xAxisMax = Math.max(maxValue * 1.2, 10); // Ensure at least 10 days range

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: colors.bg3,
        borderColor: colors.aquaBright,
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: colors.fg0 },
        formatter: (params: TopLevelFormatterParams) => {
          const param = (params as CallbackDataParams[])[0];
          const value = param.value as number;
          const speedInfo = getSpeedInfo(value);
          return `
            <div style="padding: 0.25rem 0;">
              <div style="font-weight: 600; margin-bottom: 4px;">${param.name}</div>
              <div>Average: <span style="color: ${colors.aquaBright}; font-weight: 600;">${value.toFixed(1)}</span> days</div>
              <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid ${colors.bg2};">
                <span style="color: ${speedInfo.color};">●</span> ${speedInfo.label} process
                ${value > 7 ? `<br/><span style="color: ${colors.orange}; font-size: 0.6875rem;">⚠ Exceeds 7-day target</span>` : ''}
              </div>
            </div>
          `;
        },
      },
      grid: {
        left: '3%',
        right: '8%',
        bottom: '10%',
        top: '5%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'Days Between Rounds',
        nameTextStyle: {
          color: colors.fg4,
          fontSize: 12,
          padding: [0, 0, 0, 0],
        },
        nameGap: 5,
        max: xAxisMax,
        axisLabel: { color: colors.fg4 },
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
          data: data.map((d) => d.avg_days),
          itemStyle: {
            color: (params: CallbackDataParams) => {
              const value = params.value as number;
              return getSpeedInfo(value).color;
            },
            borderRadius: [0, 4, 4, 0],
          },
          label: {
            show: true,
            position: 'right',
            formatter: (params: CallbackDataParams) => {
              const value = params.value as number;
              const speedInfo = getSpeedInfo(value);
              return `{value|${value.toFixed(1)}d} {speed|${speedInfo.label}}`;
            },
            color: colors.fg1,
            rich: {
              value: {
                fontSize: 14,
                fontWeight: 600,
                color: colors.fg0,
              },
              speed: {
                fontSize: 11,
                fontWeight: 500,
                padding: [0, 0, 0, 8],
              },
            },
          },
          barWidth: '60%',
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)',
            },
          },
        },
        // Benchmark line at 7 days
        {
          type: 'line',
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                xAxis: 7,
                lineStyle: {
                  color: colors.orange,
                  type: 'solid',
                  width: 2,
                },
                label: {
                  show: true,
                  position: 'end',
                  formatter: '7d Target',
                  color: colors.orange,
                  fontSize: 11,
                  fontWeight: 500,
                },
              },
            ],
          },
        },
      ],
    };
  }, [data, colors]);

  if (loading) {
    return <Loading message="Loading interview timeline..." size="sm" />;
  }

  if (error) {
    return <div className="text-red-bright py-8 text-center">{error}</div>;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        message="No interview timeline data available"
        subMessage="Completed interview rounds with dates will appear here"
        icon="bi-clock-history"
      />
    );
  }

  return (
    <div className="w-full">
      {/* Description */}
      <p className="text-fg4 mb-4 text-sm">
        Average number of days between interview rounds. Color indicates process
        speed:
        <span className="text-green ml-1">● Fast (≤3 days)</span>,
        <span className="text-aqua mx-1">● Normal (4-7 days)</span>,
        <span className="text-orange mx-1">● Slow (8+ days)</span>
      </p>

      {/* Chart */}
      <div className="w-full overflow-x-auto">
        <ReactECharts
          option={option}
          style={{ width: '100%', height: '31.25rem' }}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  );
}
