import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { useSankeyAnalytics } from '@/hooks/useAnalyticsData';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getSankeyNodeColor } from '@/lib/statusColors';
import { groupSankey } from '@/lib/sankey';
import { statusLabel } from '@/lib/referenceLabels';
import Loading from './Loading';
import EmptyState from './EmptyState';
import HelpTip from './HelpTip';

export default function SankeyChart({
  period = 'all',
  asOf,
}: {
  period?: string;
  asOf?: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useSankeyAnalytics(period, asOf);
  const colors = useThemeColors();
  const grouped = useMemo(
    () => (data ? groupSankey(data) : { nodes: [], links: [] }),
    [data]
  );
  const option = useMemo((): EChartsOption => {
    const byId = new Map(grouped.nodes.map((node) => [node.id, node]));
    const label = (id: string) => {
      const node = byId.get(id);
      return node
        ? statusLabel({ name: node.label, builtin_key: node.builtin_key })
        : t('Unknown');
    };
    return {
      tooltip: {
        trigger: 'item',
        renderMode: 'richText',
        backgroundColor: colors.bg3,
        borderColor: colors.aquaBright,
        textStyle: { color: colors.fg0 },
        formatter: (params: CallbackDataParams | CallbackDataParams[]) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (p.dataType === 'edge') {
            const edge = p.data as {
              source: string;
              target: string;
              value: number;
            };
            return t('{{value0}} → {{value1}}: {{value}} recorded changes', {
              value0: label(edge.source),
              value1: label(edge.target),
              value: edge.value,
            });
          }
          return t('{{value0}}: {{value1}} recorded visits', {
            value0: label(p.name),
            value1: byId.get(p.name)?.value ?? 0,
          });
        },
      },
      series: [
        {
          type: 'sankey',
          data: grouped.nodes.map((node) => ({
            name: node.id,
            depth: node.depth,
            value: node.value,
            itemStyle: {
              color: getSankeyNodeColor(
                `status_${node.meaning}`,
                colors,
                node.color
              ),
            },
          })),
          links: grouped.links,
          label: {
            color: colors.fg1,
            fontSize: 12,
            formatter: (p: CallbackDataParams) => label(p.name),
          },
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'gradient', curveness: 0.5 },
          nodeAlign: 'left',
          nodeGap: 30,
        },
      ],
    };
  }, [grouped, colors, t]);
  if (isLoading)
    return <Loading message={t('Loading chart data...')} size="sm" />;
  if (isError || !data)
    return (
      <p className="text-red-bright">{t('Failed to load pipeline chart')}</p>
    );
  if (!data.nodes.length)
    return <EmptyState message={t('No application history for this period')} />;
  if (!grouped.links.length)
    return (
      <EmptyState
        message={t('No status changes to plot yet')}
        subMessage={t(
          'The chart will appear as applications move between stages.'
        )}
      />
    );
  const columns = grouped.nodes.reduce(
    (max, node) => Math.max(max, node.depth + 1),
    1
  );
  const columnSizes = new Map<number, number>();
  for (const node of grouped.nodes)
    columnSizes.set(node.depth, (columnSizes.get(node.depth) ?? 0) + 1);
  const height = Math.max(400, Math.max(...columnSizes.values()) * 52);
  return (
    <div className="min-w-0">
      <p className="text-muted mb-4 flex items-center gap-2 text-sm">
        {t('Application pipeline')}
        <HelpTip label={t('About the pipeline chart')}>
          <p>
            {t(
              'Paths through application stages. Returning to a stage appears as a separate step.'
            )}
          </p>
        </HelpTip>
      </p>
      <div
        className="w-full overflow-x-auto"
        role="region"
        aria-label={t('Application pipeline chart')}
        tabIndex={0}
      >
        <ReactECharts
          option={option}
          style={{
            width: '100%',
            minWidth: `${Math.max(600, columns * 180)}px`,
            height: `${height}px`,
          }}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  );
}
