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
    <div className="bg-bg1 rounded-lg p-4 border-l-2 border-accent space-y-3 h-full flex flex-col">
      {/* Key Insight */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-lightning-charge text-yellow icon-sm" />
          <span className="text-fg1 font-medium text-sm">Key Insight</span>
        </div>
        <p className="text-fg2 text-sm leading-relaxed">{keyInsight}</p>
      </div>

      {/* Trend */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-graph-up text-blue icon-sm" />
          <span className="text-fg1 font-medium text-sm">Trend</span>
        </div>
        <p className="text-fg2 text-sm leading-relaxed">{trend}</p>
      </div>

      {/* Priority Actions */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <i className="bi-signpost-2 text-purple icon-sm" />
          <span className="text-fg1 font-medium text-sm">Priority Actions</span>
        </div>
        <ol className="list-decimal list-inside text-fg2 text-sm space-y-1">
          {priorityActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
