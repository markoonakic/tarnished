import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listApplications } from '../lib/applications';
import Layout from '../components/Layout';
import ActivityHeatmap from '../components/ActivityHeatmap';
import EmptyState from '../components/EmptyState';
import FlameEmblem from '../components/dashboard/FlameEmblem';
import KPICards from '../components/dashboard/KPICards';
import QuickActions from '../components/dashboard/QuickActions';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import ImportModal from '../components/ImportModal';

export default function Dashboard() {
  useAuth();
  const [totalApplications, setTotalApplications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    async function loadTotalApplications() {
      try {
        const data = await listApplications({ page: 1, per_page: 1 });
        setTotalApplications(data.total);

        // Show import prompt if no applications and user hasn't dismissed it
        if (data.total === 0) {
          const hasSeenPrompt = localStorage.getItem('import-prompt-seen');
          if (!hasSeenPrompt) {
            setShowImportPrompt(true);
          }
        }
      } catch {
        console.error('Failed to load total applications');
      } finally {
        setLoading(false);
      }
    }

    loadTotalApplications();
  }, []);

  if (loading) return null;

  const handleDismissPrompt = () => {
    localStorage.setItem('import-prompt-seen', 'true');
    setShowImportPrompt(false);
  };

  const handleOpenImportModal = () => {
    setShowImportPrompt(false);
    setShowImportModal(true);
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
  };

  const handleImportSuccess = () => {
    setShowImportModal(false);
    window.location.reload();
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {showImportPrompt && totalApplications === 0 && (
          <div className="bg-aqua/20 border border-aqua text-primary px-6 py-4 rounded-lg mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">Welcome! 👋</h3>
                <p className="text-sm">Do you have data from a previous export? You can import it to get started.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDismissPrompt}
                  className="px-4 py-2 bg-transparent text-fg1 rounded font-medium hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out cursor-pointer"
                >
                  Skip
                </button>
                <button
                  onClick={handleOpenImportModal}
                  className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright transition-colors"
                >
                  Import Data
                </button>
              </div>
            </div>
          </div>
        )}
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

            <FlameEmblem />

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
      <ImportModal
        isOpen={showImportModal}
        onClose={handleCloseImportModal}
        onSuccess={handleImportSuccess}
      />
    </Layout>
  );
}
