import { type ReactNode } from 'react';

interface SectionInsightProps {
  keyInsight: string;
  trend: string;
  priorityActions: string[];
  pattern?: string;
}

interface InsightRowProps {
  icon: string;
  iconClass: string;
  label: string;
  children: ReactNode;
}

function InsightRow({ icon, iconClass, label, children }: InsightRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <i className={`${icon} ${iconClass} icon-sm`} />
        <span className="text-fg1 font-medium text-sm">{label}</span>
      </div>
      <div className="text-fg2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export function SectionInsight({ keyInsight, trend, priorityActions, pattern }: SectionInsightProps) {
  // Determine trend icon based on content
  const isNegative = trend.includes('↓') || trend.toLowerCase().includes('declin');
  const trendIcon = isNegative ? 'bi-graph-down' : 'bi-graph-up';
  const trendClass = isNegative ? 'text-orange' : 'text-green';

  return (
    <div className="bg-tertiary rounded-lg p-4 space-y-4 transition-all duration-200 ease-in-out">
      <InsightRow icon="bi-lightning-charge" iconClass="text-accent" label="Key Insight">
        {keyInsight}
      </InsightRow>

      <InsightRow icon={trendIcon} iconClass={trendClass} label="Trend">
        {trend}
      </InsightRow>

      <InsightRow icon="bi-signpost-2" iconClass="text-accent" label="Priority Actions">
        <ol className="list-decimal list-inside space-y-1">
          {priorityActions.map((action, index) => (
            <li key={index}>{action}</li>
          ))}
        </ol>
      </InsightRow>

      {pattern && (
        <InsightRow icon="bi-bezier" iconClass="text-blue" label="Pattern">
          {pattern}
        </InsightRow>
      )}
    </div>
  );
}
