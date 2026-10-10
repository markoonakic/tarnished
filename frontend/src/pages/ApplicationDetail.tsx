import Button from '@/components/ui/Button';
import TextLink from '@/components/ui/TextLink';
import { formatDate, formatDateTime } from '@/lib/displayDate';
import { t, locale } from '@/lib/i18n';
import { statusLabel } from '@/lib/referenceLabels';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observeRead } from '../lib/queryClient';
import { getApplication, deleteApplication } from '../lib/applications';
import { deleteRound } from '../lib/rounds';
import { isAxiosError } from 'axios';
import { errorMessage } from '@/lib/errorMessage';
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
import ApplicationExtractionReview from '../components/slots/ApplicationExtractionReview';
import ApplicationProfileMatch from '../components/slots/ApplicationProfileMatch';
import ApplicationContacts from '../components/slots/ApplicationContacts';
import ApplicationReminders from '../components/slots/ApplicationReminders';
import ApplicationNotes from '../components/slots/ApplicationNotes';
import ApplicationOtherFiles from '../components/slots/ApplicationOtherFiles';
import StatusChangeDialog from '../components/StatusChangeDialog';
import RecordTags from '../components/records/RecordTags';
import RecordDetails from '../components/records/RecordDetails';
import SavedPosting from '../components/records/SavedPosting';
import { apiV030 } from '@/lib/apiV030';
import { updateApplication } from '@/lib/applications';
import { listStatuses } from '@/lib/settings';
import { getPreferences } from '@/lib/userPreferences';
import type { Status } from '@/lib/types';

export default function ApplicationDetail() {
  useTranslation();
  const { id } = useParams<{ id: string }>();
  return <ApplicationDetailContent key={id} id={id!} />;
}

function ApplicationDetailContent({ id }: { id: string }) {
  useTranslation();
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
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  useEffect(() => {
    listStatuses()
      .then(setStatuses)
      .catch(() => {
        /* Read retries when the dialog opens. */
      });
    getPreferences()
      .then((preferences) => {
        if (preferences.time_zone_mode === 'manual' && preferences.time_zone)
          setTimeZone(preferences.time_zone);
      })
      .catch(() => {
        /* Device zone fallback. */
      });
  }, []);
  async function archive(archived: boolean) {
    if (
      !application ||
      !confirm(
        t(archived ? 'records.confirmArchive' : 'records.confirmUnarchive')
      )
    )
      return;
    try {
      await apiV030.updateApplication(application.id, {
        archived,
        expected_revision: application.evidence_revision,
      });
      await loadApplication();
    } catch {
      showError(t('records.saveFailed'));
    }
  }

  const loadApplication = useCallback(async () => {
    const ownedRequest = ++requestId.current;
    setError('');
    try {
      const data = await getApplication(id);
      if (ownedRequest !== requestId.current) return;
      setApplication(data);
    } catch (error) {
      if (ownedRequest !== requestId.current) return;
      const errorMsg = t('Failed to load application');
      setError(errorMsg);
      showError(errorMsg);
      return { error };
    } finally {
      if (ownedRequest === requestId.current) setLoading(false);
    }
  }, [id, showError]);

  useEffect(() => {
    setLoading(true);
    const stop = observeRead(loadApplication);
    return () => {
      stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [loadApplication]);

  async function handleDelete() {
    if (!confirm(t('Are you sure you want to delete this application?')))
      return;
    try {
      await deleteApplication(id!, application?.evidence_revision);
      toast.success(t('Application deleted'));
      navigate('/applications');
    } catch (error) {
      const errorMsg =
        isAxiosError(error) && error.response
          ? errorMessage(error.response.data, error.response.status)
          : t('Failed to delete application');
      setError(errorMsg);
      showError(errorMsg);
    }
  }

  function handleDocumentUpdate(updated: Application) {
    setApplication((prev) => preserveApplicationRounds(prev, updated));
  }

  async function handleDeleteRound(roundId: string) {
    if (!confirm(t('Delete this round?'))) return;
    try {
      await deleteRound(
        roundId,
        application?.rounds?.find((round) => round.id === roundId)
      );

      setApplication((prev) => removeApplicationRound(prev, roundId));
      toast.success(t('Round deleted'));
    } catch (error) {
      const errorMsg =
        isAxiosError(error) && error.response
          ? errorMessage(error.response.data, error.response.status)
          : t('Failed to delete round');
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
      const errorMsg = t('Failed to refresh media');
      setError(errorMsg);
      showError(errorMsg);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-muted">{t('Loading...')}</div>
        </div>
      </Layout>
    );
  }

  if (!application) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div role="alert" className="text-red-bright">
            {error || t('Application not found')}
            <Button
              className="ml-3 flex items-center gap-1.5"
              onClick={loadApplication}
            >
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('Retry')}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <TextLink to="/applications">{t('← Back to Applications')}</TextLink>
        </div>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        {application.archived_at && (
          <div className="bg-bg2 text-muted mb-4 flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm">
            <span>{t('records.archived')}</span>
            <Button
              className="flex items-center gap-1.5"
              onClick={() => archive(false)}
            >
              <i className="bi-arrow-right icon-sm" aria-hidden="true" />
              {t('records.unarchive')}
            </Button>
          </div>
        )}
        <div className="bg-secondary mb-6 rounded-lg p-6">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-primary text-2xl font-bold">
                  {application.company_id ? (
                    <TextLink to={'/companies/' + application.company_id}>
                      {application.company || t('companies.notSet')}
                    </TextLink>
                  ) : (
                    application.company || t('companies.notSet')
                  )}
                </h1>
                {application.source && (
                  <span className="bg-bg2 text-fg1 inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium">
                    <i className="bi-link-45deg icon-xs"></i>
                    {application.source}
                  </span>
                )}
              </div>
              <p className="text-secondary text-xl">
                {application.job_title || t('companies.notSet')}
              </p>
              <p className="text-muted mt-1 flex flex-wrap items-center gap-1 text-sm">
                {application.location && (
                  <>
                    <i className="bi-geo-alt icon-sm" />
                    {application.location}
                  </>
                )}
                {[application.work_mode, application.employment_type]
                  .filter(Boolean)
                  .map((value) => (
                    <span key={value}> · {t('records.' + value)}</span>
                  ))}
                {application.seniority && (
                  <span> · {application.seniority}</span>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                type="button"
                aria-label={t('records.changeStatus')}
                onClick={async () => {
                  try {
                    setStatuses(await listStatuses());
                    setShowStatusDialog(true);
                  } catch {
                    showError(t('Failed to load statuses'));
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <span
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold"
                  style={{
                    color: getStatusColor(
                      application.status.name,
                      colors,
                      application.status.color
                    ),
                    backgroundColor: `${getStatusColor(application.status.name, colors, application.status.color)}20`,
                  }}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {statusLabel(application.status)}
                </span>
                <i className="bi-pencil ml-1" aria-hidden="true" />
                {t('records.changeStatus')}
              </Button>
              {application.outcome_reason && (
                <p className="text-muted max-w-xs text-right text-xs">
                  {application.outcome_reason}
                </p>
              )}
            </div>
          </div>

          <RecordTags
            record={application}
            type="application"
            revision={application.evidence_revision}
            onUpdated={loadApplication}
          />
          <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted">{t('Applied:')}</span>
              <span className="text-primary ml-2">
                {formatDate(application.applied_at)}
              </span>
            </div>
            <div>
              <span className="text-muted">{t('Updated:')}</span>
              <span className="text-primary ml-2">
                {formatDateTime(application.updated_at)}
              </span>
            </div>
          </div>

          <RecordDetails
            record={application}
            type="application"
            title={`${application.company} — ${application.job_title}`}
            onUpdated={loadApplication}
          />
          {application.job_url && (
            <div className="mb-4">
              <TextLink
                href={application.job_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('Open Job Page →')}
              </TextLink>
            </div>
          )}

          {/* Job Description - styled like job leads */}
          {application.job_description && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-file-text icon-sm"></i>
                {t('Description')}
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
                {t('Salary Range')}
              </h3>
              <p className="text-primary font-medium">
                {application.salary_currency || 'USD'}{' '}
                {application.salary_min?.toLocaleString(locale()) || '???'}
                {' - '}
                {application.salary_max?.toLocaleString(locale()) || '???'}
              </p>
            </div>
          )}

          <div id="application-evidence" />
          {/* Requirements - Must Have */}
          {application.requirements_must_have &&
            application.requirements_must_have.length > 0 && (
              <div className="bg-bg2 mb-4 rounded-lg p-4">
                <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                  <i className="bi-check-circle icon-sm"></i>
                  {t('Must-Have Requirements')}
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
                  {t('Nice-to-Have Requirements')}
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
                {t('Skills')}
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
                {t('Experience Required')}
              </h3>
              <p className="text-primary font-medium">
                {application.years_experience_min ?? '?'}-
                {application.years_experience_max ?? '?'} {t('years')}
              </p>
            </div>
          )}

          <SavedPosting
            id={application.id}
            type="application"
            revision={application.evidence_revision}
            text={application.source_text || application.job_description}
            url={application.job_url}
            onUpdated={loadApplication}
          />
          <div className="border-tertiary flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {!application.archived_at && (
              <Button
                className="flex items-center gap-1.5"
                onClick={() => archive(true)}
              >
                <i className="bi-archive mr-1" aria-hidden="true" />
                {t('records.archive')}
              </Button>
            )}
            <Button
              onClick={() => {
                setFeedbackOpened(true);
                setShowFeedback(true);
              }}
              className="flex items-center gap-1.5"
            >
              <i className="bi-stars icon-sm" aria-hidden="true" />
              {t('Application feedback')}
            </Button>
            <Button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5"
            >
              <i className="bi-pencil icon-sm"></i>
              {t('Edit')}
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              className="flex items-center gap-1.5"
            >
              <i className="bi-trash icon-sm"></i>
              {t('Delete')}
            </Button>
          </div>
        </div>

        <StatusChangeDialog
          isOpen={showStatusDialog}
          statusId={application.status.id}
          appliedAt={application.applied_at}
          timeZone={timeZone}
          options={statuses.map((status) => ({
            value: status.id,
            label: statusLabel(status),
            meaning: status.meaning,
          }))}
          onClose={() => setShowStatusDialog(false)}
          onSave={async (draft) => {
            await updateApplication(application.id, {
              status_id: draft.status_id,
              expected_revision: application.evidence_revision,
              status_changed_at: draft.changed_at,
              status_comment: draft.comment || null,
              status_reason: draft.reason,
              ...(draft.applied_at ? { applied_at: draft.applied_at } : {}),
            });
            await loadApplication();
          }}
        />
        <ApplicationExtractionReview
          application={application}
          onUpdated={loadApplication}
        />
        <ApplicationProfileMatch
          application={application}
          onUpdated={loadApplication}
        />

        {feedbackOpened && (
          <div hidden={!showFeedback} className="mb-6">
            <ScopedReport
              key={id}
              title={t('Application feedback')}
              scope="APPLICATION"
              endpoint={`/api/applications/${id}/feedback`}
              requestBody={(state) => ({
                generation: state.generation,
                config_revision: state.capability.configuration_revision,
              })}
              requestLabel={t('application feedback')}
              onClose={() => setShowFeedback(false)}
              emptyHint={t(
                "No feedback yet. Get suggestions from this application's saved details."
              )}
            />
          </div>
        )}

        <div className="bg-secondary mb-6 rounded-lg p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-primary text-lg font-semibold">
              {t('Interview Rounds')}
            </h2>
            {application.rounds && application.rounds.length > 0 && (
              <Button
                variant="primary"
                onClick={() => setShowRoundForm(true)}
                className="flex items-center gap-1.5"
              >
                <i className="bi-plus-lg icon-sm" aria-hidden="true" />
                {t('Add Round')}
              </Button>
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
              message={t('No interview rounds yet.')}
              icon="bi-calendar-x"
              action={{
                label: t('Add Round'),
                onClick: () => setShowRoundForm(true),
              }}
            />
          ) : null}
        </div>
        <ApplicationContacts
          application={application}
          onUpdated={loadApplication}
        />
        <ApplicationReminders
          application={application}
          onUpdated={loadApplication}
        />
        <ApplicationNotes
          application={application}
          onUpdated={loadApplication}
        />
        <div className="my-6">
          <DocumentSection
            application={application}
            onUpdate={handleDocumentUpdate}
          >
            <ApplicationOtherFiles
              application={application}
              onUpdated={loadApplication}
            />
          </DocumentSection>
        </div>
        <div className="mb-6 space-y-4">
          <HistoryViewer
            application={application}
            applicationId={id}
            revision={application.evidence_revision}
            onChanged={async () => {
              await loadApplication();
            }}
          />
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
