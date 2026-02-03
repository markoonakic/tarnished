import { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { getSankeyData } from '../lib/analytics';
import type { SankeyData } from '../lib/analytics';
import { colors } from '@/lib/theme';
import Loading from './Loading';
import EmptyState from './EmptyState';

export default function SankeyChart() {
  const [data, setData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const result = await getSankeyData();
      setData(result);
    } catch {
      setError('Failed to load Sankey data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Loading message="Loading chart data..." size="sm" />;
  }

  if (error) {
    return <div className="text-center py-8 text-accent-red">{error}</div>;
  }

  if (!data || data.nodes.length === 0 || data.links.length === 0) {
    return (
      <EmptyState message="Not enough data for visualization. Add more applications with different statuses." />
    );
  }

  // Filter links to ensure both source and target exist in nodes
  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const validLinks = data.links.filter(
    (l) => nodeIds.has(l.source) && nodeIds.has(l.target)
  );

  if (validLinks.length === 0) {
    return (
      <EmptyState message="Not enough data for visualization. Add more applications with different statuses." />
    );
  }

  // ECharts Sankey option with critical parameters for readable visualization
  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: colors.bg3,
      borderColor: colors.aquaBright,
      borderWidth: 1,
      borderRadius: 4,
      textStyle: {
        color: colors.fg0,
      },
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          return `${params.name}: ${params.value}`;
        } else if (params.dataType === 'edge') {
          return `${params.data.source} → ${params.data.target}: ${params.data.value}`;
        }
        return '';
      },
    },
    series: [
      {
        type: 'sankey',
        data: data.nodes.map((n) => ({
          name: n.name,
          id: n.id,
          itemStyle: {
            color: n.color,
          },
        })),
        links: validLinks.map((l) => ({
          source: l.source,
          target: l.target,
          value: l.value,
        })),
        // Critical parameters for readable visualization
        nodeAlign: 'justify', // Spreads nodes vertically across available space
        nodeGap: 80, // Vertical spacing between nodes (critical for multiple terminal nodes)
        layoutIterations: 32, // Layout optimization passes (critical for clean layout)
        nodeWidth: 20, // Width of each node
        // Visual styling
        itemStyle: {
          borderWidth: 1,
          borderColor: colors.bg0,
        },
        lineStyle: {
          opacity: 0.4,
          curveness: 0.5,
          color: 'gradient', // Uses gradient from source to target node colors
        },
        label: {
          color: colors.fg1,
          fontSize: 12,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: {
            opacity: 0.8,
          },
        },
      },
    ],
  };

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
