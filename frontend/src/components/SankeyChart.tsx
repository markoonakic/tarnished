import { useEffect, useState } from 'react';
import { Sankey, Tooltip, Layer, Rectangle } from 'recharts';
import { getSankeyData } from '../lib/analytics';
import type { SankeyData } from '../lib/analytics';
import Loading from './Loading';
import EmptyState from './EmptyState';

interface SankeyNodePayload {
  name: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  color?: string;
}

function SankeyNode({ x, y, width, height, index, payload }: {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SankeyNodePayload;
}) {
  // Use node color if available, otherwise fall back to preset colors
  const fallbackColors = [
    'var(--accent-aqua)',
    'var(--accent-green)',
    'var(--accent-yellow)',
    'var(--accent-orange)',
    'var(--accent-red)',
    'var(--accent-purple)',
    'var(--accent-blue)',
  ];
  const color = payload.color || fallbackColors[index % fallbackColors.length];

  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.9}
      />
      <text
        x={x + width + 6}
        y={y + height / 2}
        textAnchor="start"
        dominantBaseline="middle"
        fill="var(--text-primary)"
        fontSize={12}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

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

  const nodeMap = new Map(data.nodes.map((n, i) => [n.id, i]));

  const sankeyData = {
    nodes: data.nodes.map((n) => ({ name: n.name, color: n.color })),
    links: data.links
      .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target))
      .map((l) => ({
        source: nodeMap.get(l.source)!,
        target: nodeMap.get(l.target)!,
        value: l.value,
      })),
  };

  if (sankeyData.links.length === 0) {
    return (
      <EmptyState message="Not enough data for visualization. Add more applications with different statuses." />
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <Sankey
        width={600}
        height={400}
        data={sankeyData}
        node={<SankeyNode x={0} y={0} width={0} height={0} index={0} payload={{ name: '', value: 0, x: 0, y: 0, width: 0, height: 0, index: 0 }} />}
        nodePadding={50}
        margin={{ top: 20, right: 200, bottom: 20, left: 20 }}
        link={{ stroke: 'var(--bg-tertiary)' }}
      >
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--bg-tertiary)',
            borderRadius: '4px',
            color: 'var(--text-primary)',
          }}
        />
      </Sankey>
    </div>
  );
}
