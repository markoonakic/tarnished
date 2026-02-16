interface SectionInsightProps {
  keyInsight: string;
  trend: string;
  priorityActions: string[];
  trendDirection?: 'up' | 'down' | 'neutral';
}

export function SectionInsight({
  keyInsight,
  trend,
  priorityActions,
  trendDirection = 'neutral',
}: SectionInsightProps) {
  const trendIcon = {
    up: 'bi-graph-up',
    down: 'bi-graph-down',
    neutral: 'bi-dash',
  }[trendDirection];

  const trendColor = {
    up: 'text-green',
    down: 'text-red',
    neutral: 'text-fg2',
  }[trendDirection];

  return (
    <div className="border-t border-tertiary mt-4 pt-4">
      <div className="space-y-2">
        {/* Key Insight */}
        <div className="flex items-start gap-2">
          <i className="bi-lightning-charge text-accent icon-sm mt-0.5 flex-shrink-0" />
          <span className="text-fg1 font-medium">{keyInsight}</span>
        </div>

        {/* Trend */}
        <div className="flex items-start gap-2">
          <i className={`${trendIcon} ${trendColor} icon-sm mt-0.5 flex-shrink-0`} />
          <span className="text-fg2 text-sm">{trend}</span>
        </div>

        {/* Actions */}
        {priorityActions.map((action, i) => (
          <div key={i} className="flex items-start gap-2">
            <i className="bi-arrow-right text-fg2 icon-sm mt-0.5 flex-shrink-0" />
            <span className="text-fg2 text-sm">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
