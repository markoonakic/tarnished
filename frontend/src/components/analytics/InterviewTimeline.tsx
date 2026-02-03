import { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { getInterviewRoundsData, type TimelineData } from '@/lib/analytics';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

interface InterviewTimelineProps {
  period?: string;
  roundType?: string;
}

export default function InterviewTimeline({ period = 'all', roundType }: InterviewTimelineProps) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [period, roundType]);

  async function loadData() {
    try {
      setLoading(true);
      const result = await getInterviewRoundsData(period, roundType);
      setData(result.timeline_data);
      setError('');
    } catch (err) {
      setError('Failed to load interview timeline data');
      console.error('Error loading timeline data:', err);
    } finally {
      setLoading(false);
    }
  }

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'var(--bg3)',
        borderColor: 'var(--aqua-bright)',
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: 'var(--fg0)' },
        formatter: '{b}: {c} days average',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'Days',
        nameTextStyle: { color: 'var(--fg4)' },
        axisLabel: { color: 'var(--fg4)' },
        axisLine: { lineStyle: { color: 'var(--bg2)' } },
        splitLine: { lineStyle: { color: 'var(--bg2)' } },
      },
      yAxis: {
        type: 'category',
        data: data.map((d) => d.round),
        axisLabel: { color: 'var(--fg4)' },
        axisLine: { lineStyle: { color: 'var(--bg2)' } },
      },
      series: [{
        type: 'bar',
        data: data.map((d) => d.avg_days),
        itemStyle: { color: 'var(--aqua)' },
        label: {
          show: true,
          position: 'right',
          formatter: '{c}d',
          color: 'var(--fg1)',
        },
      }],
    };
  }, [data]);

  if (loading) {
    return <Loading message="Loading interview timeline..." size="sm" />;
  }

  if (error) {
    return <div className="text-center py-8 text-red">{error}</div>;
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
    <div className="w-full overflow-x-auto">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '400px' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
