import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { listApplications } from '../lib/applications';
import Layout from '../components/Layout';
import ActivityHeatmap from '../components/ActivityHeatmap';
import EmptyState from '../components/EmptyState';
import FlameEmblem from '../components/dashboard/FlameEmblem';
import KPICards from '../components/dashboard/KPICards';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import ImportModal from '../components/ImportModal';
import ApplicationModal from '../components/ApplicationModal';

export default function Dashboard() {
  useAuth();
  const navigate = useNavigate();
  const [totalApplications, setTotalApplications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
        // silently fail - dashboard still usable without total count
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
          <div className="bg-accent/20 border border-accent text-primary px-6 py-4 rounded-lg mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold mb-1">Welcome! 👋</h3>
                <p className="text-sm">Do you have data from a previous export? You can import it to get started.</p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <button
                  onClick={handleDismissPrompt}
                  className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
                >
                  Skip
                </button>
                <button
                  onClick={handleOpenImportModal}
                  className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
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
              onClick: () => setShowCreateModal(true)
            }}
          />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-primary mb-6">Dashboard</h1>

            <FlameEmblem />

            <KPICards />

            {/* Quick Actions - single layer cards using inline-block (no flex) to avoid Firefox animation bug */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-secondary rounded-lg p-4 hover:-translate-y-0.5 hover:bg-bg2 will-change-transform transition-[translate,background-color] duration-200 ease-in-out cursor-pointer text-left"
              >
                <i className="bi bi-plus-lg text-accent icon-xl align-middle"></i>
                <span className="text-fg1 font-medium align-middle ml-3">New Application</span>
              </button>
              <button
                onClick={() => navigate('/analytics')}
                className="bg-secondary rounded-lg p-4 hover:-translate-y-0.5 hover:bg-bg2 will-change-transform transition-[translate,background-color] duration-200 ease-in-out cursor-pointer text-left"
              >
                <i className="bi bi-graph-up text-accent icon-xl align-middle"></i>
                <span className="text-fg1 font-medium align-middle ml-3">View Analytics</span>
              </button>
              <button
                onClick={() => navigate('/applications')}
                className="bg-secondary rounded-lg p-4 hover:-translate-y-0.5 hover:bg-bg2 will-change-transform transition-[translate,background-color] duration-200 ease-in-out cursor-pointer text-left"
              >
                <i className="bi bi-list-ul text-accent icon-xl align-middle"></i>
                <span className="text-fg1 font-medium align-middle ml-3">View Applications</span>
              </button>
            </div>

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
      <ApplicationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(applicationId) => navigate(`/applications/${applicationId}`)}
      />
    </Layout>
  );
}
