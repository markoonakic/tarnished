import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SankeyChart from '../components/SankeyChart';
import ActivityHeatmap from '../components/ActivityHeatmap';
import Layout from '../components/Layout';
import { useFeedback } from '../hooks/useFeedback';
import PeriodSelector from '../components/analytics/PeriodSelector';
import AnalyticsKPIs from '../components/analytics/AnalyticsKPIs';
import WeeklyActivityChart from '../components/analytics/WeeklyActivityChart';
import InterviewFunnel from '../components/analytics/InterviewFunnel';
import InterviewOutcomes from '../components/analytics/InterviewOutcomes';
import InterviewTimeline from '../components/analytics/InterviewTimeline';
import { SeekGraceButton } from '@/components/analytics/SeekGraceButton';
import { ScopedReportContent } from '../components/ScopedReport';
import { useUserPreferences } from '@/hooks/useUserPreferences';

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = searchParams.get('period') || '7d';
  const asOf = searchParams.get('as_of') || undefined;
  const [showFeedback, setShowFeedback] = useState(true);
  const { data: preferences } = useUserPreferences();
  const reportParams = new URLSearchParams({ period });
  if (asOf) reportParams.set('as_of', asOf);
  const feedback = useFeedback(
    `/api/analytics/feedback?${reportParams}`,
    (state) => ({
      config_revision: state.capability.configuration_revision,
      period,
      as_of: asOf ?? null,
    })
  );

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-fg1 text-2xl font-bold">Analytics</h1>
            <SeekGraceButton
              loading={feedback.starting || feedback.running}
              disabled={feedback.disabled}
              label={
                feedback.readError || feedback.unknown || feedback.failed
                  ? feedback.actionLabel
                  : undefined
              }
              onSeekGrace={async () => {
                setShowFeedback(true);
                await feedback.request();
              }}
            />
          </div>
          <PeriodSelector />
        </div>
        {asOf && (
          <p className="text-muted mb-4 text-sm">
            History through {new Date(asOf).toLocaleString()}.
            <button
              className="text-accent hover:text-accent-bright ml-2 cursor-pointer rounded px-3 py-1.5 transition-all duration-200 ease-in-out"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('as_of');
                setSearchParams(next);
              }}
            >
              Show current data
            </button>
          </p>
        )}
        {!showFeedback && (
          <button
            type="button"
            className="text-accent hover:bg-bg2 hover:text-accent-bright mb-4 cursor-pointer rounded px-3 py-2 transition-colors"
            onClick={() => setShowFeedback(true)}
          >
            {feedback.running || feedback.starting
              ? 'View feedback progress'
              : 'View saved feedback'}
          </button>
        )}
        {showFeedback && (
          <div className="mb-6">
            <ScopedReportContent
              title="Pipeline feedback"
              scope="PIPELINE"
              period={period}
              feedback={feedback}
              hideAction
              onClose={() => setShowFeedback(false)}
              requestLabel="pipeline feedback"
              emptyHint="No feedback yet. Choose a period, then Seek Grace for suggestions from your saved job-search records."
            />
          </div>
        )}
        <div className="space-y-6">
          <section>
            <h2 className="text-fg1 mb-4 text-lg font-semibold">
              Pipeline Overview
            </h2>
            <div className="bg-bg1 mb-4 rounded-lg p-6">
              <AnalyticsKPIs period={period} asOf={asOf} />
            </div>
            <div className="bg-bg1 rounded-lg p-6">
              <SankeyChart period={period} asOf={asOf} />
            </div>
          </section>
          <section>
            <h2 className="text-fg1 mb-4 text-lg font-semibold">
              Interview Analytics
            </h2>
            <div className="space-y-6">
              <div className="bg-bg1 rounded-lg p-6">
                <InterviewFunnel period={period} asOf={asOf} />
              </div>
              <div className="bg-bg1 rounded-lg p-6">
                <InterviewOutcomes period={period} asOf={asOf} />
              </div>
              <div className="bg-bg1 rounded-lg p-6">
                <InterviewTimeline period={period} asOf={asOf} />
              </div>
            </div>
          </section>
          <section>
            <h2 className="text-fg1 mb-4 text-lg font-semibold">
              Activity Tracking
            </h2>
            <div className="bg-bg1 mb-4 rounded-lg p-6">
              <WeeklyActivityChart period={period} asOf={asOf} />
            </div>
            {preferences?.show_heatmap === true && (
              <div className="bg-bg1 rounded-lg p-6">
                <ActivityHeatmap />
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
