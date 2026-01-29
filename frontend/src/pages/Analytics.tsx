import { useSearchParams } from 'react-router-dom';
import SankeyChart from '../components/SankeyChart';
import ActivityHeatmap from '../components/ActivityHeatmap';
import Layout from '../components/Layout';
import PeriodSelector from '../components/analytics/PeriodSelector';
import AnalyticsKPIs from '../components/analytics/AnalyticsKPIs';
import WeeklyBarChart from '../components/analytics/WeeklyBarChart';

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get('period') || '7d';

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Analytics</h1>

        <PeriodSelector />

        <div className="space-y-8">
          {/* KPIs Section */}
          <div className="bg-secondary border border-tertiary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Key Performance Indicators</h2>
            <p className="text-sm text-muted mb-4">
              Track your job application metrics and conversion rates.
            </p>
            <AnalyticsKPIs period={period} />
          </div>

          {/* Sankey Chart Section */}
          <div className="bg-secondary border border-tertiary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Application Flow</h2>
            <p className="text-sm text-muted mb-4">
              Visualize how your applications progress through different stages.
            </p>
            <SankeyChart />
          </div>

          {/* Weekly Bar Chart Section */}
          <div className="bg-secondary border border-tertiary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Weekly Activity</h2>
            <p className="text-sm text-muted mb-4">
              Track your application and interview activity over time.
            </p>
            <WeeklyBarChart period={period} />
          </div>

          {/* Activity Heatmap Section */}
          <div className="bg-secondary border border-tertiary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Activity Overview</h2>
            <p className="text-sm text-muted mb-4">
              Track your job application activity throughout the year.
            </p>
            <ActivityHeatmap />
          </div>
        </div>
      </div>
    </Layout>
  );
}
