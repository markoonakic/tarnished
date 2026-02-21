interface SectionInsightProps {
  keyInsight: string;
  trend: string;
  priorityActions: string[];
}

export function SectionInsight({
  keyInsight,
  trend,
  priorityActions,
}: SectionInsightProps) {
  return (
    <div className="bg-bg1 border-accent flex h-full flex-col space-y-3 rounded-lg border-l-2 p-4">
      {/* Key Insight */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-lightning-charge text-yellow icon-sm" />
          <span className="text-fg1 text-sm font-medium">Key Insight</span>
        </div>
        <p className="text-fg2 text-sm leading-relaxed">{keyInsight}</p>
      </div>

      {/* Trend */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-graph-up text-blue icon-sm" />
          <span className="text-fg1 text-sm font-medium">Trend</span>
        </div>
        <p className="text-fg2 text-sm leading-relaxed">{trend}</p>
      </div>

      {/* Priority Actions */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-signpost-2 text-purple icon-sm" />
          <span className="text-fg1 text-sm font-medium">Priority Actions</span>
        </div>
        <ol className="text-fg2 list-inside list-decimal space-y-1 text-sm">
          {priorityActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
