import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApplication, deleteApplication } from '../lib/applications';
import { deleteRound } from '../lib/rounds';
import {
  mergeApplicationRoundMedia,
  preserveApplicationRounds,
  removeApplicationRound,
  upsertApplicationRound,
} from '../lib/applicationDetailState';
import type { Application, Round } from '../lib/types';
import { getStatusColor } from '../lib/statusColors';
import { useThemeColors } from '../hooks/useThemeColors';
import { useToastContext } from '../contexts/ToastContext';
import RoundForm from '../components/RoundForm';
import RoundCard from '../components/RoundCard';
import DocumentSection from '../components/DocumentSection';
import HistoryViewer from '../components/application/HistoryViewer';
import ScopedReport from '../components/ScopedReport';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';
import ApplicationModal from '../components/ApplicationModal';

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  return <ApplicationDetailContent key={id} id={id!} />;
}

function ApplicationDetailContent({ id }: { id: string }) {
  const requestId = useRef(0);
  const navigate = useNavigate();
  const colors = useThemeColors();
  const toast = useToastContext();
  const { error: showError } = toast;
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackOpened, setFeedbackOpened] = useState(false);

  const loadApplication = useCallback(async () => {
    const ownedRequest = ++requestId.current;
    setError('');
    try {
      const data = await getApplication(id);
      if (ownedRequest !== requestId.current) return;
      setApplication(data);
    } catch {
      if (ownedRequest !== requestId.current) return;
      const errorMsg = 'Failed to load application';
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      if (ownedRequest === requestId.current) setLoading(false);
    }
  }, [id, showError]);

  useEffect(() => {
    setLoading(true);
    loadApplication();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [loadApplication]);

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
      await deleteApplication(id!);
      toast.success('Application deleted');
      navigate('/applications');
    } catch {
      const errorMsg = 'Failed to delete application';
      setError(errorMsg);
      showError(errorMsg);
    }
  }

  function handleDocumentUpdate(updated: Application) {
    setApplication((prev) => preserveApplicationRounds(prev, updated));
  }

  async function handleDeleteRound(roundId: string) {
    if (!confirm('Delete this round?')) return;
    try {
      await deleteRound(roundId);

      setApplication((prev) => removeApplicationRound(prev, roundId));
      toast.success('Round deleted');
    } catch {
      const errorMsg = 'Failed to delete round';
      setError(errorMsg);
      showError(errorMsg);
    }
  }

  async function handleRoundSaved(savedRound: Round) {
    setShowRoundForm(false);
    setEditingId(null);

    handleRoundPersisted(savedRound);
  }

  function handleRoundPersisted(savedRound: Round) {
    setApplication((prev) => {
      if (!prev) return null;

      return {
        ...prev,
        rounds: upsertApplicationRound(prev.rounds, savedRound),
      };
    });
  }

  async function handleMediaChange(roundId: string) {
    try {
      const updatedApplication = await getApplication(id!);

      setApplication((prev) =>
        mergeApplicationRoundMedia(prev, updatedApplication, roundId)
      );
    } catch {
      const errorMsg = 'Failed to refresh media';
      setError(errorMsg);
      showError(errorMsg);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    // Applied dates are calendar dates, not instants in the device zone.
    return new Date(dateStr).toLocaleDateString(undefined, { timeZone: 'UTC' });
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
          <div role="alert" className="text-red-bright">
            {error || 'Application not found'}
            <button
              className="text-accent ml-3 underline"
              onClick={loadApplication}
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Link
            to="/applications"
            className="text-accent hover:text-accent-bright cursor-pointer transition-all duration-200 ease-in-out"
          >
            &larr; Back to Applications
          </Link>
        </div>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        <div className="bg-secondary mb-6 rounded-lg p-6">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-primary text-2xl font-bold">
                  {application.company}
                </h1>
                {application.source && (
                  <span className="bg-bg2 text-fg1 inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium">
                    <i className="bi-link-45deg icon-xs"></i>
                    {application.source}
                  </span>
                )}
              </div>
              <p className="text-secondary text-xl">{application.job_title}</p>
              {application.location && (
                <p className="text-muted mt-1 flex items-center gap-1 text-sm">
                  <i className="bi-geo-alt icon-sm"></i>
                  {application.location}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: `${getStatusColor(application.status.name, colors, application.status.color)}20`,
                  color: getStatusColor(
                    application.status.name,
                    colors,
                    application.status.color
                  ),
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: getStatusColor(
                      application.status.name,
                      colors,
                      application.status.color
                    ),
                  }}
                />
                {application.status.name}
              </span>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted">Applied:</span>
              <span className="text-primary ml-2">
                {formatDate(application.applied_at)}
              </span>
            </div>
            <div>
              <span className="text-muted">Updated:</span>
              <span className="text-primary ml-2">
                {formatDateTime(application.updated_at)}
              </span>
            </div>
          </div>

          {application.job_url && (
            <div className="mb-4">
              <a
                href={application.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-bright cursor-pointer text-sm transition-all duration-200 ease-in-out"
              >
                Open Job Page &rarr;
              </a>
            </div>
          )}

          {/* Job Description - styled like job leads */}
          {application.job_description && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-file-text icon-sm"></i>
                Description
              </h3>
              <div className="text-primary text-sm break-words whitespace-pre-wrap">
                {application.job_description}
              </div>
            </div>
          )}

          {/* Salary Information */}
          {(application.salary_min != null ||
            application.salary_max != null) && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
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
          {(application.recruiter_name ||
            application.recruiter_title ||
            application.recruiter_linkedin_url) && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-person icon-sm"></i>
                Recruiter
              </h3>
              <div className="space-y-1">
                {application.recruiter_name && (
                  <p className="text-primary font-medium">
                    {application.recruiter_name}
                  </p>
                )}
                {application.recruiter_title && (
                  <p className="text-secondary text-sm">
                    {application.recruiter_title}
                  </p>
                )}
                {application.recruiter_linkedin_url && (
                  <a
                    href={application.recruiter_linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-bright flex cursor-pointer items-center gap-1 text-sm transition-all duration-200 ease-in-out"
                  >
                    <i className="bi-linkedin icon-sm"></i>
                    LinkedIn Profile
                  </a>
                )}
              </div>
            </div>
          )}

          <div id="application-evidence" />
          {/* Requirements - Must Have */}
          {application.requirements_must_have &&
            application.requirements_must_have.length > 0 && (
              <div className="bg-bg2 mb-4 rounded-lg p-4">
                <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                  <i className="bi-check-circle icon-sm"></i>
                  Must-Have Requirements
                </h3>
                <ul className="text-primary list-inside list-disc space-y-1">
                  {application.requirements_must_have.map((req) => (
                    <li key={req} className="text-sm">
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Requirements - Nice to Have */}
          {application.requirements_nice_to_have &&
            application.requirements_nice_to_have.length > 0 && (
              <div className="bg-bg2 mb-4 rounded-lg p-4">
                <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                  <i className="bi-star icon-sm"></i>
                  Nice-to-Have Requirements
                </h3>
                <ul className="text-primary list-inside list-disc space-y-1">
                  {application.requirements_nice_to_have.map((req) => (
                    <li key={req} className="text-sm">
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Skills */}
          {application.skills && application.skills.length > 0 && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-lightning icon-sm"></i>
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {application.skills.map((skill) => (
                  <span
                    key={skill}
                    className="bg-bg3 text-fg1 inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Experience Range */}
          {(application.years_experience_min !== null ||
            application.years_experience_max !== null) && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-clock-history icon-sm"></i>
                Experience Required
              </h3>
              <p className="text-primary font-medium">
                {application.years_experience_min ?? '?'}-
                {application.years_experience_max ?? '?'} years
              </p>
            </div>
          )}

          <div className="border-tertiary flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <button
              onClick={() => {
                setFeedbackOpened(true);
                setShowFeedback(true);
              }}
              className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-all duration-200 ease-in-out"
            >
              <i className="bi-stars icon-sm" aria-hidden="true" />
              Application feedback
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out"
            >
              <i className="bi-pencil icon-sm"></i>
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="text-red hover:bg-bg2 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out"
            >
              <i className="bi-trash icon-sm"></i>
              Delete
            </button>
          </div>
        </div>

        {feedbackOpened && (
          <div hidden={!showFeedback} className="mb-6">
            <ScopedReport
              key={id}
              title="Application feedback"
              scope="APPLICATION"
              endpoint={`/api/applications/${id}/feedback`}
              requestBody={(state) => ({
                generation: state.generation,
                config_revision: state.capability.configuration_revision,
              })}
              requestLabel="application feedback"
              onClose={() => setShowFeedback(false)}
              emptyHint="No feedback yet. Get suggestions from this application's saved details."
            />
          </div>
        )}

        <div className="mb-6">
          <DocumentSection
            application={application}
            onUpdate={handleDocumentUpdate}
          />
        </div>

        <div className="mb-6 space-y-4">
          <HistoryViewer
            application={application}
            applicationId={id!}
            revision={application.evidence_revision}
            onChanged={loadApplication}
          />
        </div>

        <div className="bg-secondary rounded-lg p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-primary text-lg font-semibold">
              Interview Rounds
            </h2>
            {application.rounds && application.rounds.length > 0 && (
              <button
                onClick={() => setShowRoundForm(true)}
                className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
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
                onPersist={handleRoundPersisted}
                onCancel={() => setShowRoundForm(false)}
              />
            </div>
          )}

          {application.rounds && application.rounds.length > 0 ? (
            <div className="space-y-4">
              {application.rounds.map((round) =>
                round.id === editingId ? (
                  <RoundForm
                    key={round.id}
                    round={round}
                    applicationId={id!}
                    onSave={handleRoundSaved}
                    onPersist={handleRoundPersisted}
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
              )}
            </div>
          ) : !showRoundForm ? (
            <EmptyState
              message="No interview rounds yet."
              icon="bi-calendar-x"
              action={{
                label: 'Add Round',
                onClick: () => setShowRoundForm(true),
              }}
            />
          ) : null}
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
