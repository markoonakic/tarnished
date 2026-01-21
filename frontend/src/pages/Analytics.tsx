import SankeyChart from '../components/SankeyChart';
import ActivityHeatmap from '../components/ActivityHeatmap';
import Layout from '../components/Layout';

export default function Analytics() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Analytics</h1>

        <div className="space-y-8">
          <div className="bg-secondary rounded-lg p-6">
            <h2 className="text-lg font-semibold text-primary mb-4">Application Flow</h2>
            <p className="text-sm text-muted mb-4">
              Visualize how your applications progress through different stages.
            </p>
            <SankeyChart />
          </div>

          <div className="bg-secondary rounded-lg p-6">
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
