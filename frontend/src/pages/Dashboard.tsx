import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listApplications } from '../lib/applications';
import Layout from '../components/Layout';
import ActivityHeatmap from '../components/ActivityHeatmap';
import EmptyState from '../components/EmptyState';
import KPICards from '../components/dashboard/KPICards';
import QuickActions from '../components/dashboard/QuickActions';
import NeedsAttention from '../components/dashboard/NeedsAttention';

export default function Dashboard() {
  useAuth();
  const [totalApplications, setTotalApplications] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTotalApplications() {
      try {
        const data = await listApplications({ page: 1, per_page: 1 });
        setTotalApplications(data.total);
      } catch {
        console.error('Failed to load total applications');
      } finally {
        setLoading(false);
      }
    }

    loadTotalApplications();
  }, []);

  if (loading) return null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {totalApplications === 0 ? (
          <EmptyState
            message="Welcome! Add your first job application to get started."
            icon="bi-plus-circle"
            action={{
              label: "Add Application",
              onClick: () => window.location.href = '/applications/new'
            }}
          />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-primary mb-6">Dashboard</h1>

            <KPICards />
            <QuickActions />
            <NeedsAttention />

            <div className="bg-secondary rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-primary">Activity Overview</h2>
              </div>
              <ActivityHeatmap />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
