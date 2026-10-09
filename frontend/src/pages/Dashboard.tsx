import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import DashboardPipelineStrip from '../components/slots/DashboardPipelineStrip';
import DashboardUpcomingRow from '../components/slots/DashboardUpcomingRow';
import DashboardBoard from '../components/slots/DashboardBoard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observeRead } from '../lib/queryClient';
import { listApplications } from '../lib/applications';
import Layout from '../components/Layout';
import ActivityHeatmap from '../components/ActivityHeatmap';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import FlameEmblem from '../components/dashboard/FlameEmblem';
import KPICards from '../components/dashboard/KPICards';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import ImportModal from '../components/ImportModal';
import ApplicationModal from '../components/ApplicationModal';
import QuickAction from '@/components/dashboard/QuickAction';
import JobLeadCaptureForm from '../components/JobLeadCaptureForm';
import {
  hasSeenImportPrompt,
  markImportPromptSeen,
} from '../lib/dashboardPrompt';
import { useUserPreferences } from '@/hooks/useUserPreferences';

export default function Dashboard() {
  useTranslation();
  const navigate = useNavigate();
  const [totalApplications, setTotalApplications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data: preferences } = useUserPreferences();

  const hasLoadedPreferences = preferences !== undefined;
  const showStreakStats = hasLoadedPreferences && preferences.show_streak_stats;
  const showNeedsAttention =
    hasLoadedPreferences && preferences.show_needs_attention;
  const showHeatmap = hasLoadedPreferences && preferences.show_heatmap;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    async function loadTotalApplications() {
      try {
        const data = await listApplications({ page: 1, per_page: 1 });
        if (!active) return;
        setTotalApplications(data.total);
        setError(false);

        // Show import prompt if no applications and user hasn't dismissed it
        if (data.total === 0 && !hasSeenImportPrompt()) {
          setShowImportPrompt(true);
        }
      } catch (error) {
        if (active) setError(true);
        return { error };
      } finally {
        if (active) setLoading(false);
      }
    }

    const stop = observeRead(loadTotalApplications);
    return () => {
      active = false;
      stop();
    };
  }, [retry]);

  if (loading || error)
    return (
      <Layout>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h1 className="text-primary mb-6 text-2xl font-bold">
            {t('Dashboard')}
          </h1>
          {loading ? (
            <Loading message={t('Loading dashboard...')} />
          ) : (
            <div role="alert" className="text-red-bright">
              {t('Failed to load dashboard.')}
              <Button
                className="ml-3 underline"
                onClick={() => setRetry((value) => value + 1)}
              >
                {t('Retry')}
              </Button>
            </div>
          )}
        </div>
      </Layout>
    );

  const handleDismissPrompt = () => {
    markImportPromptSeen();
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
    markImportPromptSeen();
    setShowImportModal(false);
    setShowImportPrompt(false);
    setTotalApplications((count) => (count === 0 ? 1 : count));
    navigate('/applications');
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {showImportPrompt && totalApplications === 0 && (
          <div className="bg-accent/20 border-accent text-primary mb-6 rounded-lg border px-6 py-4">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="mb-1 font-semibold">{t('Welcome! 👋')}</h3>
                <p className="text-sm">
                  {t(
                    'Do you have data from a previous export? You can import it to get started.'
                  )}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-3">
                <Button onClick={handleDismissPrompt}>{t('Skip')}</Button>
                <Button variant="primary" onClick={handleOpenImportModal}>
                  {t('Import Data')}
                </Button>
              </div>
            </div>
          </div>
        )}
        {totalApplications === 0 ? (
          <>
            <EmptyState
              message={t(
                'Welcome! Add your first job application to get started.'
              )}
              icon="bi-plus-circle"
              action={{
                label: t('Add Application'),
                onClick: () => setShowCreateModal(true),
              }}
            />
            <DashboardPipelineStrip />
            <DashboardUpcomingRow />
            <DashboardBoard />
          </>
        ) : (
          <>
            <h1 className="text-primary mb-6 text-2xl font-bold">
              {t('Dashboard')}
            </h1>

            {showStreakStats && <FlameEmblem />}

            <KPICards />
            <DashboardPipelineStrip />

            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              <QuickAction
                icon="bi-plus-lg"
                onClick={() => setShowCreateModal(true)}
              >
                {t('New Application')}
              </QuickAction>
              <JobLeadCaptureForm
                trigger={(open) => (
                  <QuickAction icon="bi-link-45deg" onClick={open}>
                    {t('New Job Lead')}
                  </QuickAction>
                )}
              />
              <QuickAction icon="bi-kanban" to="/applications?view=board">
                {t('tasks.openBoard')}
              </QuickAction>
            </div>

            <DashboardUpcomingRow />
            {showNeedsAttention && <NeedsAttention />}
            <DashboardBoard />

            {showHeatmap && (
              <div className="bg-secondary rounded-lg p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-primary text-lg font-semibold">
                    {t('Activity Overview')}
                  </h2>
                </div>
                <ActivityHeatmap />
              </div>
            )}
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
