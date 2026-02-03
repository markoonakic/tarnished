import { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
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

  const option: EChartsOption = useMemo(() => {
    if (!data) return {};

    // Skip the "applications" node - we start from "Applied"
    const filteredNodes = data.nodes.filter(n => n.id !== 'applications');

    // Calculate depths: terminal nodes go at SAME level as their source stage
    const getDepth = (nodeId: string): number => {
      if (nodeId.startsWith('terminal_rejected_')) {
        const stage = nodeId.split('_').pop();
        switch (stage) {
          case 'applied': return 1; // Same level as Screening
          case 'screening': return 2; // Same level as Interviewing
          case 'interviewing': return 3; // Same level as Offer
          case 'offer': return 4; // Same level as Accepted
          default: return 2;
        }
      }
      if (nodeId.startsWith('terminal_withdrawn_')) {
        const stage = nodeId.split('_').pop();
        switch (stage) {
          case 'applied': return 1;
          case 'screening': return 2;
          case 'interviewing': return 3;
          case 'offer': return 4;
          default: return 2;
        }
      }
      // Regular status nodes
      if (nodeId.startsWith('status_applied')) return 0;
      if (nodeId.startsWith('status_screening')) return 1;
      if (nodeId.startsWith('status_interviewing')) return 2;
      if (nodeId.startsWith('status_offer')) return 3;
      if (nodeId.startsWith('status_accepted')) return 4;
      return 2; // Unknown statuses
    };

    // Simple labels - just "Rejected" or "Withdrawn", position provides context
    const nodes = filteredNodes.map((n) => ({
      name: n.id,
      depth: getDepth(n.id),
      itemStyle: { color: n.color },
    }));

    // Filter out links from/to applications and use string names
    const links = data.links
      .filter((l) => l.source !== 'applications' && l.target !== 'applications')
      .map((l) => ({
        source: l.source,
        target: l.target,
        value: l.value,
      }));

    return {
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: colors.bg3,
        borderColor: colors.aquaBright,
        borderWidth: 1,
        borderRadius: 4,
        textStyle: { color: colors.fg0 },
        formatter: (params: CallbackDataParams) => {
          const nodeId = params.name;
          let label: string;

          if (nodeId.startsWith('terminal_rejected_')) {
            const stage = nodeId.split('_').pop()?.replace(/_/g, ' ') || '';
            label = `Rejected after ${stage.charAt(0).toUpperCase() + stage.slice(1)}`;
          } else if (nodeId.startsWith('terminal_withdrawn_')) {
            const stage = nodeId.split('_').pop()?.replace(/_/g, ' ') || '';
            label = `Withdrawn after ${stage.charAt(0).toUpperCase() + stage.slice(1)}`;
          } else if (nodeId.startsWith('status_')) {
            label = nodeId.replace('status_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          } else {
            label = nodeId;
          }

          return `${label}: ${params.value}`;
        },
      },
      series: [{
        type: 'sankey',
        data: nodes,
        links: links,
        emphasis: {
          focus: 'adjacency',
        },
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
        },
        label: {
          color: colors.fg1,
          fontSize: 12,
          formatter: (params: any) => {
            // Simple labels: "Rejected", "Withdrawn", or the status name
            if (params.name.startsWith('terminal_rejected_')) {
              return 'Rejected';
            }
            if (params.name.startsWith('terminal_withdrawn_')) {
              return 'Withdrawn';
            }
            if (params.name.startsWith('status_')) {
              return params.name.replace('status_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            return params.name;
          },
        },
        nodeAlign: 'justify',
        nodeGap: 30,
        layoutIterations: 50,
      }],
    };
  }, [data]);

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
