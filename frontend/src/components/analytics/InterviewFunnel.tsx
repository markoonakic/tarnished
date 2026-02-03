import { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { getInterviewRoundsData, type FunnelData } from '@/lib/analytics';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

interface InterviewFunnelProps {
  period?: string;
  roundType?: string;
}

export default function InterviewFunnel({ period = 'all', roundType }: InterviewFunnelProps) {
  const [data, setData] = useState<FunnelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [period, roundType]);

  async function loadData() {
    try {
      setLoading(true);
      const result = await getInterviewRoundsData(period, roundType);
      setData(result.funnel_data);
      setError('');
    } catch (err) {
      setError('Failed to load interview funnel data');
      console.error('Error loading funnel data:', err);
    } finally {
      setLoading(false);
    }
  }

  const option: EChartsOption = useMemo(() => {
    if (data.length === 0) return {};

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'var(--bg3)',
        borderColor: 'var(--aqua-bright)',
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: 'var(--fg0)' },
        formatter: (params: CallbackDataParams) => {
          const dataIndex = params.dataIndex as number;
          const item = data[dataIndex];
          if (!item) return '';
          return `${item.round}<br/>Count: ${item.count}<br/>Passed: ${item.passed}<br/>Conversion: ${item.conversion_rate}%`;
        },
      },
      series: [{
        type: 'funnel',
        left: '10%',
        width: '80%',
        label: {
          formatter: '{b}: {c}',
          color: 'var(--fg0)',
        },
        labelLine: {
          lineStyle: { color: 'var(--fg4)' },
        },
        itemStyle: {
          borderColor: 'var(--aqua-bright)',
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        data: data.map((d) => ({
          value: d.count,
          name: d.round,
          itemStyle: { color: 'var(--aqua)' },
        })),
      }],
    };
  }, [data]);

  if (loading) {
    return <Loading message="Loading interview funnel..." size="sm" />;
  }

  if (error) {
    return <div className="text-center py-8 text-red">{error}</div>;
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
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '400px' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
