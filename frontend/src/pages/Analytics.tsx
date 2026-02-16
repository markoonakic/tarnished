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
import { GraceInsights } from '@/components/analytics/GraceInsights';

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get('period') || '7d';

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-fg1">Analytics</h1>
          <PeriodSelector />
        </div>

        <div className="space-y-6">
          {/* Grace Period Analysis */}
          <GraceInsights period={period} />

          {/* SECTION 1: Pipeline Overview */}
          <section>
            <h2 className="text-lg font-semibold text-fg1 mb-4">Pipeline Overview</h2>

            {/* TIER 1: Executive Summary KPIs */}
            <div className="bg-bg1 rounded-lg p-6 mb-4">
              <AnalyticsKPIs period={period} />
            </div>

            {/* TIER 1: Pipeline Funnel (Sankey) */}
            <div className="bg-bg1 rounded-lg p-6">
              <SankeyChart />
            </div>
          </section>

          {/* SECTION 2: Interview Deep Dive */}
          <section>
            <h2 className="text-lg font-semibold text-fg1 mb-4">Interview Analytics</h2>

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
            <h2 className="text-lg font-semibold text-fg1 mb-4">Activity Tracking</h2>

            {/* Weekly Activity (migrated to ECharts) */}
            <div className="bg-bg1 rounded-lg p-6 mb-4">
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
