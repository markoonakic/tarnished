import { formatDate, formatDateTime } from '@/lib/displayDate';
import { t } from '@/lib/i18n';
import { errorMessage } from '@/lib/errorMessage';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useRef } from 'react';
import { observeRead } from '../lib/queryClient';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getJobLead,
  deleteJobLead,
  extractJobLead,
  retryJobLead,
  jobLeadError,
} from '../lib/jobLeads';
import JobLeadEditForm from '../components/JobLeadEditForm';
import {
  formatExperienceRange,
  formatSalaryRange,
  getJobLeadStatusBadgeClass,
  getJobLeadStatusLabel,
} from '../lib/jobLeadDetailView';
import type { JobLead } from '../lib/types';
import { useToastContext } from '../contexts/ToastContext';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import ConvertToApplicationModal from '../components/ConvertToApplicationModal';
import LeadDetails from '../components/slots/LeadDetails';
import RecordTags from '../components/records/RecordTags';
import SavedPosting from '../components/records/SavedPosting';
import LeadDecision from '../components/slots/LeadDecision';
import LeadContacts from '../components/slots/LeadContacts';
import LeadReminders from '../components/slots/LeadReminders';
import LeadNotes from '../components/slots/LeadNotes';
import LeadProfileMatch from '../components/slots/LeadProfileMatch';
import LeadExtractionReview from '../components/slots/LeadExtractionReview';

export default function JobLeadDetail() {
  useTranslation();
  const { id } = useParams<{ id: string }>();
  return <JobLeadDetailContent key={id} id={id!} />;
}

function JobLeadDetailContent({ id }: { id: string }) {
  useTranslation();
  const requestId = useRef(0);
  const navigate = useNavigate();
  const toast = useToastContext();
  const { error: showError } = toast;
  const [jobLead, setJobLead] = useState<JobLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [confirmExtraction, setConfirmExtraction] = useState(false);
  const [stale, setStale] = useState(false);

  const loadJobLead = useCallback(async () => {
    const ownedRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const data = await getJobLead(id);
      if (ownedRequest !== requestId.current) return;
      setJobLead(data);
      setStale(false);
    } catch (error) {
      if (ownedRequest !== requestId.current) return;
      setStale(true);
      const errorMsg = t(
        'Failed to load current job lead. Any displayed data may be stale; reload before making changes.'
      );
      setError(errorMsg);
      showError(errorMsg);
      return { error };
    } finally {
      if (ownedRequest === requestId.current) setLoading(false);
    }
  }, [id, showError]);

  useEffect(() => {
    const stop = observeRead(loadJobLead);
    return () => {
      stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [loadJobLead]);

  async function handleDelete() {
    if (!confirm(t('Are you sure you want to delete this job lead?'))) return;
    try {
      await deleteJobLead(id!);
      toast.success(t('Job lead deleted'));
      navigate('/job-leads');
    } catch {
      const errorMsg = t('Failed to delete job lead');
      setError(errorMsg);
      showError(errorMsg);
    }
  }

  async function handleExtract() {
    if (!jobLead) return;
    const restarting = jobLead.status === 'processing';
    setConfirmExtraction(false);
    setExtracting(true);
    setError('');
    try {
      const request =
        jobLead.status === 'failed' || restarting
          ? retryJobLead
          : extractJobLead;
      const updated = await request(jobLead.id, {
        expected_revision: jobLead.revision,
        restart_processing: restarting,
      });
      setJobLead(updated);
      toast.success(t('ai.queued'));
    } catch (error) {
      const failure = jobLeadError(error);
      setError(
        t('Your job lead is saved. {{message}} Reload before trying again.', {
          message: failure.message,
        })
      );
      setStale(true);
      // A failed/uncertain request may have advanced the revision. Never replay it.
      try {
        setJobLead(await getJobLead(jobLead.id));
        setStale(false);
      } catch {
        /* Keep the saved identity and explicitly stale snapshot visible. */
      }
    } finally {
      setExtracting(false);
    }
  }

  async function handleConverted(applicationId: string) {
    toast.success(t('Job lead converted to application'));
    navigate(`/applications/${applicationId}`);
  }

  function getSourceBadge(source: string | null) {
    if (!source) return null;
    return (
      <span className="bg-bg2 text-fg1 inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium">
        <i className="bi-link-45deg icon-xs"></i>
        {source}
      </span>
    );
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

  if (!jobLead) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div role="alert" className="text-red-bright">
            {error || t('Job lead not found')}
            <button
              className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent ml-3 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
              onClick={loadJobLead}
            >
              <i className="bi-check2 icon-sm" aria-hidden="true" />
              {t('Reload saved lead')}
            </button>
            <Link
              className="text-accent hover:text-accent-bright focus:ring-accent ml-3 cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
              to="/job-leads"
            >
              {t('Back to Job Leads')}
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const canConvert =
    !!jobLead.title?.trim() &&
    !!jobLead.company?.trim() &&
    !jobLead.converted_to_application_id;
  const isConverted = !!jobLead.converted_to_application_id;

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Link
            to="/job-leads"
            className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
          >
            {t('← Back to Job Leads')}
          </Link>
        </div>

        {confirmExtraction && (
          <Modal
            onClose={() => setConfirmExtraction(false)}
            label={t('Extract with AI')}
          >
            <div className="bg-secondary w-full max-w-lg rounded-lg p-6">
              <h2 className="text-primary mb-4 text-lg font-semibold">
                {t('Extract with AI')}
              </h2>
              <p className="text-fg1 mb-4">
                {jobLead.status === 'processing'
                  ? t(
                      'The previous request may still be running or have been billed. Restarting may repeat paid work. Explicitly replace it?'
                    )
                  : t('ai.reviewDisclosure')}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmExtraction(false)}
                  className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                >
                  <i className="bi-x-lg icon-sm" aria-hidden="true" />
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExtract()}
                  className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                >
                  <i className="bi-arrow-right icon-sm" aria-hidden="true" />
                  {t('Extract with AI')}
                </button>
              </div>
            </div>
          </Modal>
        )}
        {error && (
          <div
            role="alert"
            className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3"
          >
            {error}
          </div>
        )}

        {(stale || error || jobLead.status === 'processing') && (
          <button
            type="button"
            disabled={extracting || editing}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent mb-4 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
            onClick={loadJobLead}
          >
            <i className="bi-check2 icon-sm" aria-hidden="true" />
            {t('Reload saved lead')}
          </button>
        )}
        {(extracting || jobLead.status === 'processing') && (
          <p role="status" className="text-yellow mb-4">
            {extracting
              ? t('Filling in job details…')
              : t(
                  'Extraction has not finished. Reload to check before trying again.'
                )}
          </p>
        )}
        {editing && (
          <JobLeadEditForm
            lead={jobLead}
            onSaved={(saved) => {
              setJobLead(saved);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
            onReload={() => {
              setEditing(false);
              void loadJobLead();
            }}
          />
        )}
        <div className="bg-secondary mb-6 rounded-lg p-6">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-primary text-2xl font-bold">
                  {jobLead.company_id ? (
                    <Link
                      to={'/companies/' + jobLead.company_id}
                      className="text-fg1 hover:text-accent-bright focus:ring-accent cursor-pointer font-medium transition-all duration-200 ease-in-out focus:ring-2"
                    >
                      {jobLead.company || t('Unknown Company')}
                    </Link>
                  ) : (
                    jobLead.company || t('Unknown Company')
                  )}
                </h1>
                {getSourceBadge(jobLead.source)}
              </div>
              <p className="text-secondary text-xl">
                {jobLead.title || t('Untitled Position')}
              </p>
              {jobLead.location && (
                <p className="text-muted mt-1 flex items-center gap-1 text-sm">
                  <i className="bi-geo-alt icon-sm"></i>
                  {jobLead.location}
                </p>
              )}
            </div>
            <div className="flex max-w-full flex-col items-end gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${getJobLeadStatusBadgeClass(jobLead.status)}`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                {extracting ? `${t('Last saved status:')} ` : ''}
                {getJobLeadStatusLabel(jobLead.status)}
              </span>
              <LeadDecision lead={jobLead} onUpdated={loadJobLead} />
              {isConverted && (
                <Link
                  to={`/applications/${jobLead.converted_to_application_id}`}
                  className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
                >
                  {t('View Application →')}
                </Link>
              )}
            </div>
          </div>

          <RecordTags
            record={jobLead}
            type="lead"
            revision={jobLead.revision}
            onUpdated={loadJobLead}
          />
          <LeadDetails lead={jobLead} onUpdated={loadJobLead} />
          <SavedPosting
            id={jobLead.id}
            type="lead"
            revision={jobLead.revision}
            text={jobLead.source_text}
            url={jobLead.url}
            truncated={jobLead.source_truncated}
            onUpdated={loadJobLead}
          />
          <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted">{t('Saved:')}</span>
              <span className="text-primary ml-2">
                {formatDateTime(jobLead.scraped_at)}
              </span>
            </div>
            {jobLead.posted_date && (
              <div>
                <span className="text-muted">{t('Posted:')}</span>
                <span className="text-primary ml-2">
                  {formatDate(jobLead.posted_date)}
                </span>
              </div>
            )}
          </div>

          {jobLead.url && (
            <div className="mb-4">
              <a
                href={jobLead.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
              >
                {t('Open Job Page →')}
              </a>
            </div>
          )}

          {jobLead.error_message && (
            <div className="bg-red-bright/10 border-red-bright/30 mb-4 rounded-lg border p-4">
              <h3 className="text-red-bright mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-exclamation-triangle icon-sm"></i>
                {extracting
                  ? t('Previous extraction error')
                  : t('Extraction Error')}
              </h3>
              <p className="text-red-bright text-sm">
                {errorMessage({ code: jobLead.error_code })}
              </p>
            </div>
          )}

          {/* Description - at the top like Applications */}
          {jobLead.description && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-file-text icon-sm"></i>
                {t('Description')}
              </h3>
              <div className="text-primary text-sm break-words whitespace-pre-wrap">
                {jobLead.description}
              </div>
            </div>
          )}

          {/* Salary Information */}
          {(jobLead.salary_min != null || jobLead.salary_max != null) && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-currency-dollar icon-sm"></i>
                {t('Salary Range')}
              </h3>
              <p className="text-primary font-medium">
                {formatSalaryRange(
                  jobLead.salary_currency,
                  jobLead.salary_min,
                  jobLead.salary_max
                )}
              </p>
            </div>
          )}

          {/* Requirements - Must Have */}
          {jobLead.requirements_must_have &&
            jobLead.requirements_must_have.length > 0 && (
              <div className="bg-bg2 mb-4 rounded-lg p-4">
                <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                  <i className="bi-check-circle icon-sm"></i>
                  {t('Must-Have Requirements')}
                </h3>
                <ul className="text-primary list-inside list-disc space-y-1">
                  {jobLead.requirements_must_have.map((req) => (
                    <li key={req} className="text-sm">
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Requirements - Nice to Have */}
          {jobLead.requirements_nice_to_have &&
            jobLead.requirements_nice_to_have.length > 0 && (
              <div className="bg-bg2 mb-4 rounded-lg p-4">
                <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                  <i className="bi-star icon-sm"></i>
                  {t('Nice-to-Have Requirements')}
                </h3>
                <ul className="text-primary list-inside list-disc space-y-1">
                  {jobLead.requirements_nice_to_have.map((req) => (
                    <li key={req} className="text-sm">
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Skills */}
          {jobLead.skills && jobLead.skills.length > 0 && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-lightning icon-sm"></i>
                {t('Skills')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {jobLead.skills.map((skill) => (
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
          {(jobLead.years_experience_min !== null ||
            jobLead.years_experience_max !== null) && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-clock-history icon-sm"></i>
                {t('Experience Required')}
              </h3>
              <p className="text-primary font-medium">
                {formatExperienceRange(
                  jobLead.years_experience_min,
                  jobLead.years_experience_max
                )}
              </p>
            </div>
          )}

          <div className="border-tertiary flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {!isConverted && (
              <button
                disabled={stale || extracting || editing}
                className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                onClick={() => setEditing(true)}
              >
                <i className="bi-pencil icon-sm" aria-hidden="true" />
                {t('Edit')}
              </button>
            )}
            {!isConverted && (
              <button
                title={
                  !canConvert
                    ? t('Add a company and job title to convert this lead.')
                    : undefined
                }
                disabled={!canConvert || stale || extracting || editing}
                onClick={() => setShowConvertModal(true)}
                className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
              >
                <i className="bi-arrow-repeat icon-sm"></i>
                {t('Convert to Application')}
              </button>
            )}
            {!isConverted && (
              <button
                disabled={stale || extracting || editing}
                onClick={() => setConfirmExtraction(true)}
                className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
              >
                <i className="bi-arrow-clockwise icon-sm"></i>
                {extracting
                  ? t('Extracting…')
                  : jobLead.status === 'processing'
                    ? t('Restart interrupted extraction')
                    : jobLead.status === 'failed'
                      ? t('Retry Extraction')
                      : t('Extract with AI')}
              </button>
            )}
            <button
              onClick={handleDelete}
              className="text-red hover:bg-bg2 hover:text-red-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
            >
              <i className="bi-trash icon-sm"></i>
              {t('Delete')}
            </button>
          </div>
        </div>
        <LeadExtractionReview lead={jobLead} onUpdated={loadJobLead} />
        <LeadProfileMatch lead={jobLead} onUpdated={loadJobLead} />
        <LeadContacts lead={jobLead} onUpdated={loadJobLead} />
        <LeadReminders lead={jobLead} onUpdated={loadJobLead} />
        <LeadNotes lead={jobLead} onUpdated={loadJobLead} />
      </div>
      {jobLead && (
        <ConvertToApplicationModal
          isOpen={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          lead={jobLead}
          onConverted={handleConverted}
        />
      )}
    </Layout>
  );
}
