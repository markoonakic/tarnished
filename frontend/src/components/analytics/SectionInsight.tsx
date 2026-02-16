interface SectionInsightProps {
  title: string;
  icon: string;
  keyInsight: string;
  trend: string;
  priorityActions: string[];
  trendDirection?: 'up' | 'down' | 'neutral';
}

export function SectionInsight({
  title,
  icon,
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
    <div className="bg-bg1 rounded-lg p-4 border-l-2 border-accent">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3">
        <i className={`${icon} text-accent icon-sm`} />
        <span className="text-fg1 font-medium text-sm">{title}</span>
      </div>

      <div className="space-y-2">
        {/* Key Insight */}
        <div className="flex items-start gap-2">
          <i className="bi-lightning-charge text-accent icon-xs mt-0.5 flex-shrink-0" />
          <span className="text-fg1 text-sm">{keyInsight}</span>
        </div>

        {/* Trend */}
        <div className="flex items-start gap-2">
          <i className={`${trendIcon} ${trendColor} icon-xs mt-0.5 flex-shrink-0`} />
          <span className="text-fg2 text-xs">{trend}</span>
        </div>

        {/* Actions */}
        {priorityActions.map((action, i) => (
          <div key={i} className="flex items-start gap-2">
            <i className="bi-arrow-right text-fg2 icon-xs mt-0.5 flex-shrink-0" />
            <span className="text-fg2 text-xs">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
