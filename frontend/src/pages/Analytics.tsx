import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SankeyChart from '../components/SankeyChart';
import ActivityHeatmap from '../components/ActivityHeatmap';
import Layout from '../components/Layout';
import PeriodSelector from '../components/analytics/PeriodSelector';
import AnalyticsKPIs from '../components/analytics/AnalyticsKPIs';
import WeeklyActivityChart from '../components/analytics/WeeklyActivityChart';
import InterviewFunnel from '../components/analytics/InterviewFunnel';
import InterviewOutcomes from '../components/analytics/InterviewOutcomes';
import InterviewTimeline from '../components/analytics/InterviewTimeline';
import { SeekGraceButton } from '@/components/analytics/SeekGraceButton';
import { OverallGrace } from '@/components/analytics/OverallGrace';
import { SectionInsight } from '@/components/analytics/SectionInsight';
import { useGraceInsights } from '@/hooks/useGraceInsights';
import { useToast } from '@/hooks/useToast';

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get('period') || '7d';

  const { configured, loading, insights, error, seekGrace } =
    useGraceInsights(period);
  const toast = useToast();

  // Show error toast when error occurs
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error, toast]);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Page Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-fg1 text-2xl font-bold">Analytics</h1>
            {configured && (
              <SeekGraceButton onSeekGrace={seekGrace} loading={loading} />
            )}
          </div>
          <PeriodSelector />
        </div>

        {/* Overall Grace Message */}
        {insights && (
          <div className="mb-6">
            <OverallGrace message={insights.overall_grace} />
          </div>
        )}

        {/* Grouped Section Insights */}
        {insights && (
          <section className="mb-8">
            <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
              {/* Pipeline Guidance */}
              <div className="flex flex-col">
                <h3 className="text-fg1 mb-3 flex items-center gap-2 font-medium">
                  <i className="bi-funnel text-accent icon-sm" />
                  Pipeline Guidance
                </h3>
                <div className="flex-1">
                  <SectionInsight
                    keyInsight={insights.pipeline_overview.key_insight}
                    trend={insights.pipeline_overview.trend}
                    priorityActions={
                      insights.pipeline_overview.priority_actions
                    }
                  />
                </div>
              </div>

              {/* Interview Guidance */}
              <div className="flex flex-col">
                <h3 className="text-fg1 mb-3 flex items-center gap-2 font-medium">
                  <i className="bi-people text-accent icon-sm" />
                  Interview Guidance
                </h3>
                <div className="flex-1">
                  <SectionInsight
                    keyInsight={insights.interview_analytics.key_insight}
                    trend={insights.interview_analytics.trend}
                    priorityActions={
                      insights.interview_analytics.priority_actions
                    }
                  />
                </div>
              </div>

              {/* Activity Guidance */}
              <div className="flex flex-col">
                <h3 className="text-fg1 mb-3 flex items-center gap-2 font-medium">
                  <i className="bi-calendar-week text-accent icon-sm" />
                  Activity Guidance
                </h3>
                <div className="flex-1">
                  <SectionInsight
                    keyInsight={insights.activity_tracking.key_insight}
                    trend={insights.activity_tracking.trend}
                    priorityActions={
                      insights.activity_tracking.priority_actions
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="space-y-6">
          {/* SECTION 1: Pipeline Overview */}
          <section>
            <h2 className="text-fg1 mb-4 text-lg font-semibold">
              Pipeline Overview
            </h2>

            {/* TIER 1: Executive Summary KPIs */}
            <div className="bg-bg1 mb-4 rounded-lg p-6">
              <AnalyticsKPIs period={period} />
            </div>

            {/* TIER 1: Pipeline Funnel (Sankey) */}
            <div className="bg-bg1 rounded-lg p-6">
              <SankeyChart />
            </div>
          </section>

          {/* SECTION 2: Interview Deep Dive */}
          <section>
            <h2 className="text-fg1 mb-4 text-lg font-semibold">
              Interview Analytics
            </h2>

            <div className="space-y-6">
              <div className="bg-bg1 rounded-lg p-6">
                <InterviewFunnel period={period} />
              </div>

              <div className="bg-bg1 rounded-lg p-6">
                <InterviewOutcomes period={period} />
              </div>

              <div className="bg-bg1 rounded-lg p-6">
                <InterviewTimeline period={period} />
              </div>
            </div>
          </section>

          {/* SECTION 3: Activity Tracking */}
          <section>
            <h2 className="text-fg1 mb-4 text-lg font-semibold">
              Activity Tracking
            </h2>

            {/* Weekly Activity (migrated to ECharts) */}
            <div className="bg-bg1 mb-4 rounded-lg p-6">
              <WeeklyActivityChart period={period} />
            </div>

            {/* Activity Heatmap */}
            <div className="bg-bg1 rounded-lg p-6">
              <ActivityHeatmap />
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
