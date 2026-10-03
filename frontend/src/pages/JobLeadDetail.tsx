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
import ConvertToApplicationModal from '../components/ConvertToApplicationModal';

export default function JobLeadDetail() {
  const { id } = useParams<{ id: string }>();
  return <JobLeadDetailContent key={id} id={id!} />;
}

function JobLeadDetailContent({ id }: { id: string }) {
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
      const errorMsg =
        'Failed to load current job lead. Any displayed data may be stale; reload before making changes.';
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
    if (!confirm('Are you sure you want to delete this job lead?')) return;
    try {
      await deleteJobLead(id!);
      toast.success('Job lead deleted');
      navigate('/job-leads');
    } catch {
      const errorMsg = 'Failed to delete job lead';
      setError(errorMsg);
      showError(errorMsg);
    }
  }

  async function handleExtract() {
    if (!jobLead) return;
    const restarting = jobLead.status === 'processing';
    if (
      !confirm(
        restarting
          ? 'The previous request may still be running or have been billed. Restarting may repeat paid work. Explicitly replace it?'
          : 'Send this job posting to the configured AI service to fill in its details? Charges may apply.'
      )
    )
      return;
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
      toast.success('Extraction completed');
    } catch (error) {
      const failure = jobLeadError(error);
      setError(
        `Your job lead is saved. ${failure.message} Reload before trying again.`
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
    toast.success('Job lead converted to application');
    navigate(`/applications/${applicationId}`);
  }

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
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
          <div className="text-muted">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (!jobLead) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div role="alert" className="text-red-bright">
            {error || 'Job lead not found'}
            <button
              className="text-accent ml-3 underline"
              onClick={loadJobLead}
            >
              Reload saved lead
            </button>
            <Link className="text-accent ml-3 underline" to="/job-leads">
              Back to Job Leads
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
            className="text-accent hover:text-accent-bright cursor-pointer transition-all duration-200 ease-in-out"
          >
            &larr; Back to Job Leads
          </Link>
        </div>

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
            className="text-accent mb-4 underline"
            onClick={loadJobLead}
          >
            Reload saved lead
          </button>
        )}
        {(extracting || jobLead.status === 'processing') && (
          <p role="status" className="text-yellow mb-4">
            {extracting
              ? 'Filling in job details…'
              : 'Extraction has not finished. Reload to check before trying again.'}
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
                  {jobLead.company || 'Unknown Company'}
                </h1>
                {getSourceBadge(jobLead.source)}
              </div>
              <p className="text-secondary text-xl">
                {jobLead.title || 'Untitled Position'}
              </p>
              {jobLead.location && (
                <p className="text-muted mt-1 flex items-center gap-1 text-sm">
                  <i className="bi-geo-alt icon-sm"></i>
                  {jobLead.location}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${getJobLeadStatusBadgeClass(jobLead.status)}`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                {extracting ? 'Last saved status: ' : ''}
                {getJobLeadStatusLabel(jobLead.status)}
              </span>
              {isConverted && (
                <Link
                  to={`/applications/${jobLead.converted_to_application_id}`}
                  className="text-accent hover:text-accent-bright cursor-pointer text-sm transition-all duration-200 ease-in-out"
                >
                  View Application &rarr;
                </Link>
              )}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted">Saved:</span>
              <span className="text-primary ml-2">
                {formatDateTime(jobLead.scraped_at)}
              </span>
            </div>
            {jobLead.posted_date && (
              <div>
                <span className="text-muted">Posted:</span>
                <span className="text-primary ml-2">
                  {new Date(jobLead.posted_date).toLocaleDateString(undefined, {
                    timeZone: 'UTC',
                  })}
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
                className="text-accent hover:text-accent-bright cursor-pointer text-sm transition-all duration-200 ease-in-out"
              >
                Open Job Page &rarr;
              </a>
            </div>
          )}

          {jobLead.error_message && (
            <div className="bg-red-bright/10 border-red-bright/30 mb-4 rounded-lg border p-4">
              <h3 className="text-red-bright mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-exclamation-triangle icon-sm"></i>
                {extracting ? 'Previous extraction error' : 'Extraction Error'}
              </h3>
              <p className="text-red-bright text-sm">{jobLead.error_message}</p>
            </div>
          )}

          {(jobLead.source_text || jobLead.content_warning) && (
            <details className="bg-bg2 mb-4 rounded-lg p-4">
              <summary className="text-primary cursor-pointer">
                Saved posting
              </summary>
              {jobLead.source_truncated && (
                <p className="text-muted my-2 text-sm">
                  Only part of the posting was saved.
                </p>
              )}
              {jobLead.content_warning && (
                <p className="text-yellow mb-2">{jobLead.content_warning}</p>
              )}
              <pre className="text-primary max-h-96 overflow-auto text-sm break-words whitespace-pre-wrap">
                {jobLead.source_text}
              </pre>
            </details>
          )}

          {/* Description - at the top like Applications */}
          {jobLead.description && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-file-text icon-sm"></i>
                Description
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
                Salary Range
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

          {/* Recruiter Information */}
          {(jobLead.recruiter_name ||
            jobLead.recruiter_title ||
            jobLead.recruiter_linkedin_url) && (
            <div className="bg-bg2 mb-4 rounded-lg p-4">
              <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                <i className="bi-person icon-sm"></i>
                Recruiter
              </h3>
              <div className="space-y-1">
                {jobLead.recruiter_name && (
                  <p className="text-primary font-medium">
                    {jobLead.recruiter_name}
                  </p>
                )}
                {jobLead.recruiter_title && (
                  <p className="text-secondary text-sm">
                    {jobLead.recruiter_title}
                  </p>
                )}
                {jobLead.recruiter_linkedin_url && (
                  <a
                    href={
                      /^https?:\/\//i.test(jobLead.recruiter_linkedin_url)
                        ? jobLead.recruiter_linkedin_url
                        : undefined
                    }
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

          {/* Requirements - Must Have */}
          {jobLead.requirements_must_have &&
            jobLead.requirements_must_have.length > 0 && (
              <div className="bg-bg2 mb-4 rounded-lg p-4">
                <h3 className="text-muted mb-2 flex items-center gap-1.5 text-sm">
                  <i className="bi-check-circle icon-sm"></i>
                  Must-Have Requirements
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
                  Nice-to-Have Requirements
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
                Skills
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
                Experience Required
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
                className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50"
                onClick={() => setEditing(true)}
              >
                <i className="bi-pencil icon-sm" aria-hidden="true" />
                Edit
              </button>
            )}
            {!canConvert && !isConverted && (
              <p className="text-muted text-sm">
                Add a company and job title to convert this lead.
              </p>
            )}
            {canConvert && (
              <button
                disabled={stale || extracting || editing}
                onClick={() => setShowConvertModal(true)}
                className="bg-aqua text-bg0 hover:bg-aqua-bright flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="bi-arrow-repeat icon-sm"></i>
                Convert to Application
              </button>
            )}
            {!isConverted && (
              <button
                disabled={stale || extracting || editing}
                onClick={handleExtract}
                className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="bi-arrow-clockwise icon-sm"></i>
                {extracting
                  ? 'Extracting…'
                  : jobLead.status === 'processing'
                    ? 'Restart interrupted extraction'
                    : jobLead.status === 'failed'
                      ? 'Retry Extraction'
                      : 'Extract with AI'}
              </button>
            )}
            <button
              onClick={handleDelete}
              className="text-red hover:bg-bg2 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out"
            >
              <i className="bi-trash icon-sm"></i>
              Delete
            </button>
          </div>
        </div>
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
