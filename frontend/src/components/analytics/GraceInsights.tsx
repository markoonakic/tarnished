import { useState, useEffect } from 'react';
import { generateInsights, isAIConfigured, type GraceInsights } from '@/lib/insights';
import { SectionInsight } from './SectionInsight';
import { useToast } from '@/hooks/useToast';

interface GraceInsightsProps {
  period: string;
}

export function GraceInsights({ period }: GraceInsightsProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<GraceInsights | null>(null);
  const toast = useToast();

  // Check if AI is configured on mount
  useEffect(() => {
    isAIConfigured()
      .then(setConfigured)
      .catch(() => setConfigured(false));
  }, []);

  // Reset insights when period changes
  useEffect(() => {
    setInsights(null);
  }, [period]);

  const handleSeekGrace = async () => {
    setLoading(true);
    try {
      const data = await generateInsights(period);
      setInsights(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  // Not configured - don't show anything
  if (configured === false) {
    return null;
  }

  // Still checking configuration
  if (configured === null) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Seek Grace Button */}
      {!insights && (
        <button
          onClick={handleSeekGrace}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-transparent text-accent hover:bg-bg1 transition-all duration-200 ease-in-out rounded cursor-pointer disabled:opacity-50"
        >
          <i className={`bi-sun icon-md ${loading ? 'animate-pulse' : ''}`} />
          <span>{loading ? 'Seeking Grace...' : 'Seek Grace'}</span>
        </button>
      )}

      {/* Insights Content */}
      {insights && (
        <div className="space-y-6">
          {/* Overall Grace */}
          <div className="bg-bg2 rounded-lg p-4 border-l-2 border-accent">
            <div className="flex items-center gap-2 mb-2">
              <i className="bi-sun text-accent-bright icon-md" />
              <span className="text-fg1 font-medium">Guidance of Grace</span>
            </div>
            <p className="text-fg2 italic leading-relaxed">"{insights.overall_grace}"</p>
          </div>

          {/* Section Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <h3 className="text-fg1 font-medium mb-3 flex items-center gap-2">
                <i className="bi-funnel icon-sm text-accent" />
                Pipeline Guidance
              </h3>
              <SectionInsight
                keyInsight={insights.pipeline_overview.key_insight}
                trend={insights.pipeline_overview.trend}
                priorityActions={insights.pipeline_overview.priority_actions}
                pattern={insights.pipeline_overview.pattern}
              />
            </div>

            <div>
              <h3 className="text-fg1 font-medium mb-3 flex items-center gap-2">
                <i className="bi-people icon-sm text-accent" />
                Interview Guidance
              </h3>
              <SectionInsight
                keyInsight={insights.interview_analytics.key_insight}
                trend={insights.interview_analytics.trend}
                priorityActions={insights.interview_analytics.priority_actions}
                pattern={insights.interview_analytics.pattern}
              />
            </div>

            <div>
              <h3 className="text-fg1 font-medium mb-3 flex items-center gap-2">
                <i className="bi-calendar-week icon-sm text-accent" />
                Activity Guidance
              </h3>
              <SectionInsight
                keyInsight={insights.activity_tracking.key_insight}
                trend={insights.activity_tracking.trend}
                priorityActions={insights.activity_tracking.priority_actions}
                pattern={insights.activity_tracking.pattern}
              />
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => setInsights(null)}
            className="flex items-center gap-2 px-3 py-1.5 bg-transparent text-fg1 hover:bg-bg1 transition-all duration-200 ease-in-out rounded cursor-pointer text-sm"
          >
            <i className="bi-arrow-repeat icon-sm" />
            <span>Refresh Grace</span>
          </button>
        </div>
      )}
    </div>
  );
}
