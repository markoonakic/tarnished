import { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { getInterviewRoundsData, type OutcomeData } from '@/lib/analytics';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

interface InterviewOutcomesProps {
  period?: string;
  roundType?: string;
}

export default function InterviewOutcomes({ period = 'all', roundType }: InterviewOutcomesProps) {
  const [data, setData] = useState<OutcomeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [period, roundType]);

  async function loadData() {
    try {
      setLoading(true);
      const result = await getInterviewRoundsData(period, roundType);
      setData(result.outcome_data);
      setError('');
    } catch (err) {
      setError('Failed to load interview outcomes data');
      console.error('Error loading outcomes data:', err);
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
      },
      legend: {
        data: ['Passed', 'Failed', 'Pending', 'Withdrew'],
        top: 0,
        textStyle: { color: 'var(--fg1)' },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.round),
        axisLabel: { color: 'var(--fg4)' },
        axisLine: { lineStyle: { color: 'var(--bg2)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'var(--fg4)' },
        axisLine: { lineStyle: { color: 'var(--bg2)' } },
        splitLine: { lineStyle: { color: 'var(--bg2)' } },
      },
      series: [
        {
          name: 'Passed',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d) => d.passed),
          itemStyle: { color: 'var(--green)' },
        },
        {
          name: 'Failed',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d) => d.failed),
          itemStyle: { color: 'var(--red)' },
        },
        {
          name: 'Pending',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d) => d.pending),
          itemStyle: { color: 'var(--orange)' },
        },
        {
          name: 'Withdrew',
          type: 'bar',
          stack: 'outcomes',
          data: data.map((d) => d.withdrew),
          itemStyle: { color: 'var(--yellow)' },
        },
      ],
    };
  }, [data]);

  if (loading) {
    return <Loading message="Loading interview outcomes..." size="sm" />;
  }

  if (error) {
    return <div className="text-center py-8 text-red">{error}</div>;
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
    <div className="w-full overflow-x-auto">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '400px' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
