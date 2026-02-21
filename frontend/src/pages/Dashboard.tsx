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
      <div className="mx-auto max-w-6xl px-4 py-8">
        {showImportPrompt && totalApplications === 0 && (
          <div className="bg-accent/20 border-accent text-primary mb-6 rounded-lg border px-6 py-4">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="mb-1 font-semibold">Welcome! 👋</h3>
                <p className="text-sm">
                  Do you have data from a previous export? You can import it to
                  get started.
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-3">
                <button
                  onClick={handleDismissPrompt}
                  className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded-md bg-transparent px-4 py-2 font-medium transition-all duration-200 ease-in-out"
                >
                  Skip
                </button>
                <button
                  onClick={handleOpenImportModal}
                  className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
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
              label: 'Add Application',
              onClick: () => setShowCreateModal(true),
            }}
          />
        ) : (
          <>
            <h1 className="text-primary mb-6 text-2xl font-bold">Dashboard</h1>

            <FlameEmblem />

            <KPICards />

            {/* Quick Actions - single layer cards using inline-block (no flex) to avoid Firefox animation bug */}
            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-secondary hover:bg-bg2 cursor-pointer rounded-lg p-4 text-left transition-[translate,background-color] duration-200 ease-in-out will-change-transform hover:-translate-y-0.5"
              >
                <i className="bi bi-plus-lg text-accent icon-xl align-middle"></i>
                <span className="text-fg1 ml-3 align-middle font-medium">
                  New Application
                </span>
              </button>
              <button
                onClick={() => navigate('/analytics')}
                className="bg-secondary hover:bg-bg2 cursor-pointer rounded-lg p-4 text-left transition-[translate,background-color] duration-200 ease-in-out will-change-transform hover:-translate-y-0.5"
              >
                <i className="bi bi-graph-up text-accent icon-xl align-middle"></i>
                <span className="text-fg1 ml-3 align-middle font-medium">
                  View Analytics
                </span>
              </button>
              <button
                onClick={() => navigate('/applications')}
                className="bg-secondary hover:bg-bg2 cursor-pointer rounded-lg p-4 text-left transition-[translate,background-color] duration-200 ease-in-out will-change-transform hover:-translate-y-0.5"
              >
                <i className="bi bi-list-ul text-accent icon-xl align-middle"></i>
                <span className="text-fg1 ml-3 align-middle font-medium">
                  View Applications
                </span>
              </button>
            </div>

            <NeedsAttention />

            <div className="bg-secondary rounded-lg p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-primary text-lg font-semibold">
                  Activity Overview
                </h2>
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
        onSuccess={(applicationId) =>
          navigate(`/applications/${applicationId}`)
        }
      />
    </Layout>
  );
}
