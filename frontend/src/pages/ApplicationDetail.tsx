import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApplication, deleteApplication } from '../lib/applications';
import { deleteRound } from '../lib/rounds';
import type { Application, Round } from '../lib/types';
import { getStatusColor } from '../lib/statusColors';
import { useThemeColors } from '../hooks/useThemeColors';
import { useToastContext } from '../contexts/ToastContext';
import RoundForm from '../components/RoundForm';
import RoundCard from '../components/RoundCard';
import DocumentSection from '../components/DocumentSection';
import HistoryViewer from '../components/application/HistoryViewer';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';
import ApplicationModal from '../components/ApplicationModal';

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const colors = useThemeColors();
  const toast = useToastContext();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (id) loadApplication();
  }, [id]);

  async function loadApplication() {
    setLoading(true);
    setError('');
    try {
      const data = await getApplication(id!);
      setApplication(data);
    } catch {
      const errorMsg = 'Failed to load application';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
      await deleteApplication(id!);
      toast.success('Application deleted');
      navigate('/applications');
    } catch {
      const errorMsg = 'Failed to delete application';
      setError(errorMsg);
      toast.error(errorMsg);
    }
  }

  function handleDocumentUpdate(updated: Application) {
    // Preserve existing rounds since document endpoints don't return them
    setApplication(prev => prev ? { ...updated, rounds: prev.rounds } : updated);
  }

  async function handleDeleteRound(roundId: string) {
    if (!confirm('Delete this round?')) return;
    try {
      await deleteRound(roundId);

      setApplication(prev => prev ? {
        ...prev,
        rounds: prev.rounds?.filter(r => r.id !== roundId) || []
      } : null);
      toast.success('Round deleted');
    } catch {
      const errorMsg = 'Failed to delete round';
      setError(errorMsg);
      toast.error(errorMsg);
    }
  }

  async function handleRoundSaved(savedRound: Round) {
    setShowRoundForm(false);
    setEditingId(null);

    setApplication(prev => {
      if (!prev) return null;

      const rounds = prev.rounds || [];
      const existingIndex = rounds.findIndex(r => r.id === savedRound.id);

      if (existingIndex >= 0) {
        const newRounds = [...rounds];
        newRounds[existingIndex] = savedRound;
        return { ...prev, rounds: newRounds };
      } else {
        return { ...prev, rounds: [...rounds, savedRound] };
      }
    });
  }

  async function handleMediaChange(roundId: string) {
    try {
      const updatedApplication = await getApplication(id!);

      setApplication(prev => {
        if (!prev) return updatedApplication;

        const updatedRound = updatedApplication.rounds?.find(r => r.id === roundId);
        if (!updatedRound) return prev;

        return {
          ...prev,
          rounds: prev.rounds?.map(r => r.id === roundId ? updatedRound : r) || []
        };
      });
    } catch {
      const errorMsg = 'Failed to refresh media';
      setError(errorMsg);
      toast.error(errorMsg);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  }

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-muted">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (!application) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-red-bright">Application not found</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/applications" className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out cursor-pointer">
            &larr; Back to Applications
          </Link>
        </div>

        {error && (
          <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="bg-secondary rounded-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-primary">{application.company}</h1>
                {application.source && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-bg2 text-fg1">
                    <i className="bi-link-45deg icon-xs"></i>
                    {application.source}
                  </span>
                )}
              </div>
              <p className="text-xl text-secondary">{application.job_title}</p>
              {application.location && (
                <p className="text-muted text-sm mt-1 flex items-center gap-1">
                  <i className="bi-geo-alt icon-sm"></i>
                  {application.location}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold"
                style={{
                  backgroundColor: `${getStatusColor(application.status.name, colors, application.status.color)}20`,
                  color: getStatusColor(application.status.name, colors, application.status.color),
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getStatusColor(application.status.name, colors, application.status.color) }}
                />
                {application.status.name}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <span className="text-muted">Applied:</span>
              <span className="text-primary ml-2">{formatDate(application.applied_at)}</span>
            </div>
            <div>
              <span className="text-muted">Updated:</span>
              <span className="text-primary ml-2">{formatDateTime(application.updated_at)}</span>
            </div>
          </div>

          {application.job_url && (
            <div className="mb-4">
              <a
                href={application.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out text-sm cursor-pointer"
              >
                Open Job Page &rarr;
              </a>
            </div>
          )}

          {/* Job Description - styled like job leads */}
          {application.job_description && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-file-text icon-sm"></i>
                Description
              </h3>
              <div className="text-primary whitespace-pre-wrap break-words text-sm">
                {application.job_description}
              </div>
            </div>
          )}

          {/* Salary Information */}
          {(application.salary_min || application.salary_max) && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-currency-dollar icon-sm"></i>
                Salary Range
              </h3>
              <p className="text-primary font-medium">
                {application.salary_currency || 'USD'}{' '}
                {application.salary_min?.toLocaleString() || '???'}
                {' - '}
                {application.salary_max?.toLocaleString() || '???'}
              </p>
            </div>
          )}

          {/* Recruiter Information */}
          {(application.recruiter_name || application.recruiter_title || application.recruiter_linkedin_url) && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-person icon-sm"></i>
                Recruiter
              </h3>
              <div className="space-y-1">
                {application.recruiter_name && (
                  <p className="text-primary font-medium">{application.recruiter_name}</p>
                )}
                {application.recruiter_title && (
                  <p className="text-secondary text-sm">{application.recruiter_title}</p>
                )}
                {application.recruiter_linkedin_url && (
                  <a
                    href={application.recruiter_linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out text-sm cursor-pointer flex items-center gap-1"
                  >
                    <i className="bi-linkedin icon-sm"></i>
                    LinkedIn Profile
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Requirements - Must Have */}
          {application.requirements_must_have && application.requirements_must_have.length > 0 && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-check-circle icon-sm"></i>
                Must-Have Requirements
              </h3>
              <ul className="list-disc list-inside text-primary space-y-1">
                {application.requirements_must_have.map((req, index) => (
                  <li key={index} className="text-sm">{req}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Requirements - Nice to Have */}
          {application.requirements_nice_to_have && application.requirements_nice_to_have.length > 0 && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-star icon-sm"></i>
                Nice-to-Have Requirements
              </h3>
              <ul className="list-disc list-inside text-primary space-y-1">
                {application.requirements_nice_to_have.map((req, index) => (
                  <li key={index} className="text-sm">{req}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills */}
          {application.skills && application.skills.length > 0 && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-lightning icon-sm"></i>
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {application.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-bg3 text-fg1"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Experience Range */}
          {(application.years_experience_min !== null || application.years_experience_max !== null) && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-clock-history icon-sm"></i>
                Experience Required
              </h3>
              <p className="text-primary font-medium">
                {application.years_experience_min ?? '?'}-{application.years_experience_max ?? '?'} years
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-tertiary">
            <button
              onClick={() => setShowEditModal(true)}
              className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
            >
              <i className="bi-pencil icon-sm"></i>
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
            >
              <i className="bi-trash icon-sm"></i>
              Delete
            </button>
          </div>
        </div>

        <div className="mb-6">
          <DocumentSection
            application={application}
            onUpdate={handleDocumentUpdate}
          />
        </div>

        <div className="mb-6">
          <HistoryViewer applicationId={id!} />
        </div>

        <div className="bg-secondary rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-primary">Interview Rounds</h2>
            {application.rounds && application.rounds.length > 0 && (
              <button
                onClick={() => setShowRoundForm(true)}
                className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer"
              >
                Add Round
              </button>
            )}
          </div>

          {showRoundForm && (
            <div className="mb-4">
              <RoundForm
                applicationId={id!}
                onSave={handleRoundSaved}
                onCancel={() => setShowRoundForm(false)}
              />
            </div>
          )}

          {application.rounds && application.rounds.length > 0 ? (
            <div className="space-y-4">
              {application.rounds.map((round) => (
                round.id === editingId ? (
                  <RoundForm
                    key={round.id}
                    round={round}
                    applicationId={id!}
                    onSave={handleRoundSaved}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <RoundCard
                    key={round.id}
                    round={round}
                    onEdit={() => setEditingId(round.id)}
                    onDelete={() => handleDeleteRound(round.id)}
                    onMediaChange={() => handleMediaChange(round.id)}
                  />
                )
              ))}
            </div>
          ) : (
            <EmptyState
              message="No interview rounds yet."
              icon="bi-calendar-x"
              action={{
                label: 'Add Round',
                onClick: () => setShowRoundForm(true),
              }}
            />
          )}
        </div>
      </div>
      {application && (
        <ApplicationModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            loadApplication();
          }}
          application={application}
        />
      )}
    </Layout>
  );
}
