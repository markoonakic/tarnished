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

  return (
    <div className="bg-bg1 rounded-lg p-4 border-l-2 border-accent space-y-3">
      {/* Key Insight */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-lightning-charge text-accent icon-sm" />
          <span className="text-fg1 font-medium text-sm">Key Insight</span>
        </div>
        <p className="text-fg2 text-sm leading-relaxed">{keyInsight}</p>
      </div>

      {/* Trend */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className={`${trendIcon} text-accent icon-sm`} />
          <span className="text-fg1 font-medium text-sm">Trend</span>
        </div>
        <p className="text-fg2 text-sm leading-relaxed">{trend}</p>
      </div>

      {/* Priority Actions */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-signpost-2 text-accent icon-sm" />
          <span className="text-fg1 font-medium text-sm">Priority Actions</span>
        </div>
        <ol className="list-decimal list-inside text-fg2 text-sm space-y-1">
          {priorityActions.map((action, i) => (
            <li key={i}>{action}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
